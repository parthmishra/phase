use std::env;
use std::time::Duration;

use futures_util::StreamExt;
use phase_ai::llm_projection::LlmDecisionRequest;
use reqwest::header::{AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use url::Url;

const MAX_REQUEST_BYTES: usize = 64 * 1024;
const MAX_RESPONSE_BYTES: usize = 8 * 1024;
const DEFAULT_TIMEOUT_MS: u64 = 8_000;
/// Upper bound for `PHASE_LLM_AI_TIMEOUT_MS` and direct provider construction.
const MAX_TIMEOUT_MS: u64 = 120_000;
const CONNECT_TIMEOUT_MS: u64 = 2_000;
const RESPONSES_MAX_OUTPUT_TOKENS: u16 = 4_096;
const SYSTEM_PROMPT: &str = "Choose one listed candidate. Use visible card text, the engine intent/rankings, and the previous plan as advice. Reply with exactly one JSON object: {\"candidate_id\":\"cNNN\",\"plan\":\"a concise next-turn plan\"}. Plan must be at most 280 characters. Do not invent actions or include other fields.";

#[derive(Clone)]
pub struct LlmProvider {
    client: reqwest::Client,
    endpoint: Url,
    model: String,
    api_key: Option<String>,
    timeout: Duration,
    api_style: ApiStyle,
    reasoning_effort: Option<ReasoningEffort>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ApiStyle {
    ChatCompletions,
    Responses,
}

impl ApiStyle {
    fn from_env_value(value: &str) -> Option<Self> {
        match value {
            "chat_completions" => Some(Self::ChatCompletions),
            "responses" => Some(Self::Responses),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum ReasoningEffort {
    None,
    Low,
    Medium,
    High,
    Xhigh,
    Max,
}

impl ReasoningEffort {
    fn from_env_value(value: &str) -> Option<Self> {
        match value {
            "none" => Some(Self::None),
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            "xhigh" => Some(Self::Xhigh),
            "max" => Some(Self::Max),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LlmChoice {
    pub candidate_id: String,
    pub plan: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LlmProviderError {
    InvalidConfiguration,
    RequestTooLarge,
    Transport,
    Timeout,
    HttpStatus(u16),
    ResponseTooLarge,
    MalformedResponse,
    InvalidCandidateId,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    messages: [ChatMessage<'a>; 2],
    temperature: f32,
    max_tokens: u16,
}

#[derive(Serialize)]
struct ChatMessage<'a> {
    role: &'static str,
    content: &'a str,
}

#[derive(Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatResponseMessage,
}

#[derive(Deserialize)]
struct ChatResponseMessage {
    content: String,
}

#[derive(Serialize)]
struct ResponsesRequest<'a> {
    model: &'a str,
    instructions: &'static str,
    input: &'a str,
    reasoning: ReasoningConfig,
    max_output_tokens: u16,
    store: bool,
}

#[derive(Serialize)]
struct ReasoningConfig {
    effort: ReasoningEffort,
}

#[derive(Deserialize)]
struct ResponsesResponse {
    output: Vec<ResponseOutputItem>,
}

#[derive(Deserialize)]
struct ResponseOutputItem {
    #[serde(default)]
    content: Vec<ResponseContent>,
}

#[derive(Deserialize)]
struct ResponseContent {
    #[serde(rename = "type")]
    kind: String,
    #[serde(default)]
    text: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ModelDecision {
    candidate_id: String,
    #[serde(default)]
    plan: Option<String>,
}

impl LlmProvider {
    pub fn from_env() -> Option<Self> {
        let endpoint = env::var("PHASE_LLM_AI_ENDPOINT").ok()?;
        let model = env::var("PHASE_LLM_AI_MODEL").ok()?;
        if model.trim().is_empty() {
            return None;
        }
        let api_key = env::var("PHASE_LLM_AI_API_KEY")
            .ok()
            .filter(|key| !key.is_empty());
        let timeout_ms = env::var("PHASE_LLM_AI_TIMEOUT_MS")
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .filter(|value| *value > 0)
            .unwrap_or(DEFAULT_TIMEOUT_MS);
        let api_style = env::var("PHASE_LLM_AI_API_STYLE")
            .ok()
            .map(|value| ApiStyle::from_env_value(&value))
            .unwrap_or(Some(ApiStyle::ChatCompletions))?;
        let reasoning_effort = match env::var("PHASE_LLM_AI_REASONING_EFFORT") {
            Ok(value) => Some(ReasoningEffort::from_env_value(&value)?),
            Err(_) => None,
        };
        Self::new_with_options(
            &endpoint,
            model,
            api_key,
            Duration::from_millis(timeout_ms),
            api_style,
            reasoning_effort,
        )
        .ok()
    }

    #[cfg(test)]
    fn new(
        endpoint: &str,
        model: String,
        api_key: Option<String>,
        timeout: Duration,
    ) -> Result<Self, LlmProviderError> {
        Self::new_with_options(
            endpoint,
            model,
            api_key,
            timeout,
            ApiStyle::ChatCompletions,
            None,
        )
    }

    fn new_with_options(
        endpoint: &str,
        model: String,
        api_key: Option<String>,
        timeout: Duration,
        api_style: ApiStyle,
        reasoning_effort: Option<ReasoningEffort>,
    ) -> Result<Self, LlmProviderError> {
        let endpoint = Url::parse(endpoint).map_err(|_| LlmProviderError::InvalidConfiguration)?;
        if !endpoint.username().is_empty() || endpoint.password().is_some() {
            return Err(LlmProviderError::InvalidConfiguration);
        }
        let loopback = endpoint.host_str().is_some_and(|host| {
            host.eq_ignore_ascii_case("localhost")
                || host
                    .parse::<std::net::IpAddr>()
                    .is_ok_and(|address| address.is_loopback())
        });
        if endpoint.scheme() != "https" && !(endpoint.scheme() == "http" && loopback) {
            return Err(LlmProviderError::InvalidConfiguration);
        }
        if model.trim().is_empty()
            || timeout.is_zero()
            || timeout > Duration::from_millis(MAX_TIMEOUT_MS)
            || (api_style == ApiStyle::ChatCompletions && reasoning_effort.is_some())
        {
            return Err(LlmProviderError::InvalidConfiguration);
        }

        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_millis(CONNECT_TIMEOUT_MS))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| LlmProviderError::InvalidConfiguration)?;
        Ok(Self {
            client,
            endpoint,
            model,
            api_key,
            timeout,
            api_style,
            reasoning_effort,
        })
    }

    pub async fn choose(
        &self,
        decision: &LlmDecisionRequest,
    ) -> Result<LlmChoice, LlmProviderError> {
        let user =
            serde_json::to_string(decision).map_err(|_| LlmProviderError::MalformedResponse)?;
        let body = match self.api_style {
            ApiStyle::ChatCompletions => serde_json::to_vec(&ChatRequest {
                model: &self.model,
                messages: [
                    ChatMessage {
                        role: "system",
                        content: SYSTEM_PROMPT,
                    },
                    ChatMessage {
                        role: "user",
                        content: &user,
                    },
                ],
                temperature: 0.0,
                max_tokens: 128,
            }),
            ApiStyle::Responses => serde_json::to_vec(&ResponsesRequest {
                model: &self.model,
                instructions: SYSTEM_PROMPT,
                input: &user,
                reasoning: ReasoningConfig {
                    effort: self.reasoning_effort.unwrap_or(ReasoningEffort::Medium),
                },
                max_output_tokens: RESPONSES_MAX_OUTPUT_TOKENS,
                store: false,
            }),
        };
        let body = body.map_err(|_| LlmProviderError::MalformedResponse)?;
        if body.len() > MAX_REQUEST_BYTES {
            return Err(LlmProviderError::RequestTooLarge);
        }

        tokio::time::timeout(self.timeout, self.send_and_read(body))
            .await
            .map_err(|_| LlmProviderError::Timeout)?
    }

    async fn send_and_read(&self, body: Vec<u8>) -> Result<LlmChoice, LlmProviderError> {
        let mut request = self
            .client
            .post(self.endpoint.clone())
            .header(CONTENT_TYPE, "application/json")
            .body(body);
        if let Some(api_key) = &self.api_key {
            request = request.header(AUTHORIZATION, format!("Bearer {api_key}"));
        }
        let response = request
            .send()
            .await
            .map_err(|_| LlmProviderError::Transport)?;
        if !response.status().is_success() {
            return Err(LlmProviderError::HttpStatus(response.status().as_u16()));
        }
        if response
            .headers()
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<usize>().ok())
            .is_some_and(|length| length > MAX_RESPONSE_BYTES)
        {
            return Err(LlmProviderError::ResponseTooLarge);
        }

        let mut bytes = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|_| LlmProviderError::Transport)?;
            if bytes.len().saturating_add(chunk.len()) > MAX_RESPONSE_BYTES {
                return Err(LlmProviderError::ResponseTooLarge);
            }
            bytes.extend_from_slice(&chunk);
        }

        let content = match self.api_style {
            ApiStyle::ChatCompletions => {
                let parsed: ChatResponse = serde_json::from_slice(&bytes)
                    .map_err(|_| LlmProviderError::MalformedResponse)?;
                let [choice]: [ChatChoice; 1] = parsed
                    .choices
                    .try_into()
                    .map_err(|_| LlmProviderError::MalformedResponse)?;
                choice.message.content
            }
            ApiStyle::Responses => {
                let parsed: ResponsesResponse = serde_json::from_slice(&bytes)
                    .map_err(|_| LlmProviderError::MalformedResponse)?;
                let output_text = parsed
                    .output
                    .into_iter()
                    .flat_map(|item| item.content)
                    .filter(|content| content.kind == "output_text")
                    .filter_map(|content| content.text)
                    .collect::<Vec<_>>();
                let [content]: [String; 1] = output_text
                    .try_into()
                    .map_err(|_| LlmProviderError::MalformedResponse)?;
                content
            }
        };
        parse_model_decision(&content)
    }
}

fn parse_model_decision(content: &str) -> Result<LlmChoice, LlmProviderError> {
    let decision: ModelDecision =
        serde_json::from_str(content.trim()).map_err(|_| LlmProviderError::MalformedResponse)?;
    let candidate = decision.candidate_id.trim();
    let valid = candidate.len() == 4
        && candidate.as_bytes()[0] == b'c'
        && candidate.as_bytes()[1..].iter().all(u8::is_ascii_digit);
    if !valid {
        return Err(LlmProviderError::InvalidCandidateId);
    }
    let plan = match decision.plan {
        Some(plan) => {
            let normalized = plan.split_whitespace().collect::<Vec<_>>().join(" ");
            if normalized.is_empty() || normalized.chars().count() > 280 {
                return Err(LlmProviderError::MalformedResponse);
            }
            Some(normalized)
        }
        None => None,
    };
    Ok(LlmChoice {
        candidate_id: candidate.to_string(),
        plan,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use phase_ai::llm_projection::{
        CandidateSnapshot, CandidateSummary, DecisionSnapshot, EngineIntentSnapshot,
        RelativePlayer, StrategySnapshot,
    };
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;
    use tokio::sync::oneshot;

    fn decision() -> LlmDecisionRequest {
        LlmDecisionRequest {
            turn_number: 1,
            phase: "PreCombatMain".to_string(),
            decision: DecisionSnapshot::Priority,
            active_player: RelativePlayer::You,
            decision_subject: RelativePlayer::You,
            strategy: StrategySnapshot {
                engine_intent: EngineIntentSnapshot::Develop,
                previous_plan: None,
            },
            players: vec![],
            battlefield: vec![],
            stack: vec![],
            exile: vec![],
            command_zone: vec![],
            card_context: vec![],
            candidates: vec![CandidateSnapshot {
                id: "c000".to_string(),
                action: CandidateSummary::PassPriority,
                engine_preference: 50,
                engine_rank: 1,
            }],
        }
    }

    async fn provider_for_response(
        response_body: String,
    ) -> (LlmProvider, oneshot::Receiver<String>) {
        provider_for_response_with_options(
            response_body,
            ApiStyle::ChatCompletions,
            None,
            "/v1/chat/completions",
        )
        .await
    }

    async fn provider_for_response_with_options(
        response_body: String,
        api_style: ApiStyle,
        reasoning_effort: Option<ReasoningEffort>,
        path: &str,
    ) -> (LlmProvider, oneshot::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (request_tx, request_rx) = oneshot::channel();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0_u8; 4096];
            loop {
                let read = stream.read(&mut buffer).await.unwrap();
                if read == 0 {
                    break;
                }
                bytes.extend_from_slice(&buffer[..read]);
                if let Some(header_end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..header_end + 4]);
                    let content_length = headers
                        .lines()
                        .find_map(|line| {
                            line.strip_prefix("content-length: ")
                                .or_else(|| line.strip_prefix("Content-Length: "))
                        })
                        .and_then(|value| value.parse::<usize>().ok())
                        .unwrap_or(0);
                    if bytes.len() >= header_end + 4 + content_length {
                        break;
                    }
                }
            }
            let _ = request_tx.send(String::from_utf8_lossy(&bytes).into_owned());
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                response_body.len(),
                response_body
            );
            stream.write_all(response.as_bytes()).await.unwrap();
        });

        (
            LlmProvider::new_with_options(
                &format!("http://{address}{path}"),
                "test-model".to_string(),
                Some("secret".to_string()),
                Duration::from_secs(2),
                api_style,
                reasoning_effort,
            )
            .unwrap(),
            request_rx,
        )
    }

    #[test]
    fn endpoint_rejects_credentials_and_non_loopback_http() {
        assert!(matches!(
            LlmProvider::new(
                "https://user:pass@example.com/v1/chat/completions",
                "model".to_string(),
                None,
                Duration::from_secs(1)
            ),
            Err(LlmProviderError::InvalidConfiguration)
        ));
        assert!(matches!(
            LlmProvider::new(
                "http://example.com/v1/chat/completions",
                "model".to_string(),
                None,
                Duration::from_secs(1)
            ),
            Err(LlmProviderError::InvalidConfiguration)
        ));
    }

    #[test]
    fn timeout_rejects_values_above_documented_maximum() {
        assert!(LlmProvider::new(
            "http://127.0.0.1/v1/chat/completions",
            "model".to_string(),
            None,
            Duration::from_millis(MAX_TIMEOUT_MS),
        )
        .is_ok());
        assert!(matches!(
            LlmProvider::new(
                "http://127.0.0.1/v1/chat/completions",
                "model".to_string(),
                None,
                Duration::from_millis(MAX_TIMEOUT_MS + 1),
            ),
            Err(LlmProviderError::InvalidConfiguration)
        ));
    }

    #[tokio::test]
    async fn sends_exact_bounded_schema_and_accepts_only_id() {
        let body = r#"{"choices":[{"message":{"content":"{\"candidate_id\":\"c000\",\"plan\":\"Develop mana, then hold interaction\"}"}}]}"#.to_string();
        let (provider, request_rx) = provider_for_response(body).await;
        assert_eq!(
            provider.choose(&decision()).await.unwrap(),
            LlmChoice {
                candidate_id: "c000".to_string(),
                plan: Some("Develop mana, then hold interaction".to_string()),
            }
        );
        let request = request_rx.await.unwrap();
        assert!(request.contains("authorization: Bearer secret"));
        assert!(request.contains("\"temperature\":0.0"));
        assert!(request.contains("\"max_tokens\":128"));
        assert!(request.contains("Choose one listed candidate"));
    }

    #[tokio::test]
    async fn responses_api_sends_reasoning_effort_and_reads_output_text() {
        let body = serde_json::json!({
            "output": [
                {"type": "reasoning", "content": []},
                {
                    "type": "message",
                    "content": [{
                        "type": "output_text",
                        "text": "{\"candidate_id\":\"c000\",\"plan\":\"Hold interaction\"}"
                    }]
                }
            ]
        })
        .to_string();
        let (provider, request_rx) = provider_for_response_with_options(
            body,
            ApiStyle::Responses,
            Some(ReasoningEffort::High),
            "/v1/responses",
        )
        .await;

        assert_eq!(
            provider.choose(&decision()).await.unwrap(),
            LlmChoice {
                candidate_id: "c000".to_string(),
                plan: Some("Hold interaction".to_string()),
            }
        );
        let request = request_rx.await.unwrap();
        assert!(request.starts_with("POST /v1/responses HTTP/1.1"));
        assert!(request.contains("\"reasoning\":{\"effort\":\"high\"}"));
        assert!(request.contains("\"max_output_tokens\":4096"));
        assert!(request.contains("\"store\":false"));
        assert!(!request.contains("\"temperature\""));
    }

    #[tokio::test]
    async fn responses_api_rejects_multiple_output_text_items() {
        let body = serde_json::json!({
            "output": [{
                "type": "message",
                "content": [
                    {"type": "output_text", "text": "{\"candidate_id\":\"c000\"}"},
                    {"type": "output_text", "text": "{\"candidate_id\":\"c001\"}"}
                ]
            }]
        })
        .to_string();
        let (provider, _) = provider_for_response_with_options(
            body,
            ApiStyle::Responses,
            Some(ReasoningEffort::Medium),
            "/v1/responses",
        )
        .await;
        assert_eq!(
            provider.choose(&decision()).await,
            Err(LlmProviderError::MalformedResponse)
        );
    }

    #[tokio::test]
    async fn rejects_prose_and_multiple_choices() {
        for body in [
            r#"{"choices":[{"message":{"content":"choose c000"}}]}"#,
            r#"{"choices":[{"message":{"content":"{\"candidate_id\":\"c000\"}"}},{"message":{"content":"{\"candidate_id\":\"c001\"}"}}]}"#,
        ] {
            let (provider, _) = provider_for_response(body.to_string()).await;
            assert!(provider.choose(&decision()).await.is_err());
        }
    }

    #[tokio::test]
    async fn rejects_overlong_plan_and_unknown_response_fields() {
        let decisions = [
            serde_json::json!({"candidate_id": "c000", "plan": "x".repeat(281)}),
            serde_json::json!({"candidate_id": "c000", "plan": "Develop", "extra": true}),
        ];
        for decision in decisions {
            let body = serde_json::json!({
                "choices": [{"message": {"content": decision.to_string()}}]
            })
            .to_string();
            let (provider, _) = provider_for_response(body).await;
            assert!(provider.choose(&self::decision()).await.is_err());
        }
    }

    #[tokio::test]
    async fn rejects_fixed_length_oversize_response() {
        let (provider, _) = provider_for_response("x".repeat(MAX_RESPONSE_BYTES + 1)).await;
        assert_eq!(
            provider.choose(&decision()).await,
            Err(LlmProviderError::ResponseTooLarge)
        );
    }

    #[tokio::test]
    async fn total_timeout_covers_delayed_response_body() {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut buffer = [0_u8; 4096];
            let _ = stream.read(&mut buffer).await;
            tokio::time::sleep(Duration::from_millis(100)).await;
            let body = r#"{"choices":[{"message":{"content":"c000"}}]}"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes()).await;
        });
        let provider = LlmProvider::new(
            &format!("http://{address}/v1/chat/completions"),
            "test-model".to_string(),
            None,
            Duration::from_millis(20),
        )
        .unwrap();
        assert_eq!(
            provider.choose(&decision()).await,
            Err(LlmProviderError::Timeout)
        );
    }
}
