CREATE MATERIALIZED VIEW IF NOT EXISTS otel_2.codex_logs_to_traces
TO otel_2.otel_traces AS
SELECT
    ResourceAttributes['ProjectId'] AS ProjectId,
    Timestamp,
    lower(hex(MD5(LogAttributes['conversation.id']))) AS TraceId,
    substring(lower(hex(MD5(concat(LogAttributes['conversation.id'], ':', toString(Timestamp), ':', LogAttributes['event.name'], ':', LogAttributes['tool_name'])))), 1, 16) AS SpanId,
    if(LogAttributes['event.name'] = 'codex.user_prompt', '', substring(lower(hex(MD5(concat(LogAttributes['conversation.id'], ':root')))), 1, 16)) AS ParentSpanId,
    '' AS TraceState,
    multiIf(
        LogAttributes['event.name'] = 'codex.user_prompt', concat('Codex ', LogAttributes['model']),
        LogAttributes['event.name'] = 'codex.tool_result', concat('execute_tool ', LogAttributes['tool_name']),
        concat('chat ', LogAttributes['model'])
    ) AS SpanName,
    'INTERNAL' AS SpanKind,
    'codex' AS ServiceName,
    ResourceAttributes,
    'codex-agentops-bridge' AS ScopeName,
    '' AS ScopeVersion,
    map(
        'gen_ai.operation.name', multiIf(LogAttributes['event.name'] = 'codex.tool_result', 'execute_tool', LogAttributes['event.name'] = 'codex.user_prompt', 'invoke_agent', 'chat'),
        'gen_ai.agent.name', 'codex',
        'gen_ai.conversation.id', LogAttributes['conversation.id'],
        'gen_ai.request.model', LogAttributes['model'],
        'gen_ai.response.model', LogAttributes['model'],
        'gen_ai.usage.prompt_tokens', LogAttributes['input_token_count'],
        'gen_ai.usage.completion_tokens', LogAttributes['output_token_count'],
        'gen_ai.usage.cache_read_input_tokens', LogAttributes['cached_token_count'],
        'gen_ai.usage.reasoning_tokens', LogAttributes['reasoning_token_count'],
        'gen_ai.usage.total_tokens', toString(toUInt64OrZero(LogAttributes['input_token_count']) + toUInt64OrZero(LogAttributes['output_token_count']) + toUInt64OrZero(LogAttributes['cached_token_count']) + toUInt64OrZero(LogAttributes['reasoning_token_count'])),
        'gen_ai.tool.name', LogAttributes['tool_name'],
        'tool.name', LogAttributes['tool_name']
    ) AS SpanAttributes,
    toUInt64OrZero(LogAttributes['duration_ms']) * 1000000 AS Duration,
    if(LogAttributes['success'] = 'false', 'ERROR', 'OK') AS StatusCode,
    '' AS StatusMessage,
    CAST([], 'Array(DateTime64(9))') AS `Events.Timestamp`,
    CAST([], 'Array(LowCardinality(String))') AS `Events.Name`,
    CAST([], 'Array(Map(LowCardinality(String), String))') AS `Events.Attributes`,
    CAST([], 'Array(String)') AS `Links.TraceId`,
    CAST([], 'Array(String)') AS `Links.SpanId`,
    CAST([], 'Array(String)') AS `Links.TraceState`,
    CAST([], 'Array(Map(LowCardinality(String), String))') AS `Links.Attributes`
FROM otel_2.otel_logs
WHERE ResourceAttributes['service.name'] IN ('codex_cli_rs', 'codex_exec')
  AND (
    LogAttributes['event.name'] IN ('codex.user_prompt', 'codex.tool_result')
    OR (LogAttributes['event.name'] = 'codex.sse_event' AND LogAttributes['input_token_count'] != '')
  );

INSERT INTO otel_2.otel_traces
SELECT
    ResourceAttributes['ProjectId'] AS ProjectId,
    Timestamp,
    lower(hex(MD5(LogAttributes['conversation.id']))) AS TraceId,
    substring(lower(hex(MD5(concat(LogAttributes['conversation.id'], ':', toString(Timestamp), ':', LogAttributes['event.name'], ':', LogAttributes['tool_name'])))), 1, 16) AS SpanId,
    if(LogAttributes['event.name'] = 'codex.user_prompt', '', substring(lower(hex(MD5(concat(LogAttributes['conversation.id'], ':root')))), 1, 16)) AS ParentSpanId,
    '' AS TraceState,
    multiIf(LogAttributes['event.name'] = 'codex.user_prompt', concat('Codex ', LogAttributes['model']), LogAttributes['event.name'] = 'codex.tool_result', concat('execute_tool ', LogAttributes['tool_name']), concat('chat ', LogAttributes['model'])) AS SpanName,
    'INTERNAL' AS SpanKind,
    'codex' AS ServiceName,
    ResourceAttributes,
    'codex-agentops-bridge' AS ScopeName,
    '' AS ScopeVersion,
    map('gen_ai.operation.name', multiIf(LogAttributes['event.name'] = 'codex.tool_result', 'execute_tool', LogAttributes['event.name'] = 'codex.user_prompt', 'invoke_agent', 'chat'), 'gen_ai.agent.name', 'codex', 'gen_ai.conversation.id', LogAttributes['conversation.id'], 'gen_ai.request.model', LogAttributes['model'], 'gen_ai.response.model', LogAttributes['model'], 'gen_ai.usage.prompt_tokens', LogAttributes['input_token_count'], 'gen_ai.usage.completion_tokens', LogAttributes['output_token_count'], 'gen_ai.usage.cache_read_input_tokens', LogAttributes['cached_token_count'], 'gen_ai.usage.reasoning_tokens', LogAttributes['reasoning_token_count'], 'gen_ai.usage.total_tokens', toString(toUInt64OrZero(LogAttributes['input_token_count']) + toUInt64OrZero(LogAttributes['output_token_count']) + toUInt64OrZero(LogAttributes['cached_token_count']) + toUInt64OrZero(LogAttributes['reasoning_token_count'])), 'gen_ai.tool.name', LogAttributes['tool_name'], 'tool.name', LogAttributes['tool_name']) AS SpanAttributes,
    toUInt64OrZero(LogAttributes['duration_ms']) * 1000000 AS Duration,
    if(LogAttributes['success'] = 'false', 'ERROR', 'OK') AS StatusCode,
    '' AS StatusMessage,
    CAST([], 'Array(DateTime64(9))') AS `Events.Timestamp`,
    CAST([], 'Array(LowCardinality(String))') AS `Events.Name`,
    CAST([], 'Array(Map(LowCardinality(String), String))') AS `Events.Attributes`,
    CAST([], 'Array(String)') AS `Links.TraceId`,
    CAST([], 'Array(String)') AS `Links.SpanId`,
    CAST([], 'Array(String)') AS `Links.TraceState`,
    CAST([], 'Array(Map(LowCardinality(String), String))') AS `Links.Attributes`
FROM otel_2.otel_logs
WHERE ResourceAttributes['service.name'] IN ('codex_cli_rs', 'codex_exec')
  AND (
    LogAttributes['event.name'] IN ('codex.user_prompt', 'codex.tool_result')
    OR (LogAttributes['event.name'] = 'codex.sse_event' AND LogAttributes['input_token_count'] != '')
  );
