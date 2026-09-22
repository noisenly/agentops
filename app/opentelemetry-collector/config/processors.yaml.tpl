processors:
  resource:
    attributes:
      - key: ProjectId
        action: upsert
        value: "3bf8d5f8-436d-42ce-ab84-486a771d09ec"
      - key: {{ SEMCONV.AGENTOPS_PROJECT_ID }}
        action: upsert
        value: "3bf8d5f8-436d-42ce-ab84-486a771d09ec"

  resourcedetection/system:
    detectors: ['system']
    system:
      hostname_sources: ['os']

  transform:
    trace_statements:
      # we are using root-level trace_statements so that the cache is shared across
      # all transforms in the pipeline (as opposed to `- scope: span` which creates
      # a new cache for each transform)

      # OpenCode follows the current GenAI convention; the dashboard's cost and
      # token queries use the legacy AgentOps names.
      - set(span.attributes["{{ SEMCONV.LLM_USAGE_PROMPT_TOKENS }}"], span.attributes["gen_ai.usage.input_tokens"])
        where span.attributes["{{ SEMCONV.LLM_USAGE_PROMPT_TOKENS }}"] == nil and span.attributes["gen_ai.usage.input_tokens"] != nil
      - set(span.attributes["{{ SEMCONV.LLM_USAGE_COMPLETION_TOKENS }}"], span.attributes["gen_ai.usage.output_tokens"])
        where span.attributes["{{ SEMCONV.LLM_USAGE_COMPLETION_TOKENS }}"] == nil and span.attributes["gen_ai.usage.output_tokens"] != nil

      # cost data gets populated dynamically on container build
      {% for cost in MODEL_COSTS %}
      - set( span.cache["_input_costs"]["{{ cost.model }}"], {{ cost.input }})
      - set(span.cache["_output_costs"]["{{ cost.model }}"], {{ cost.output }})
      {% endfor %}

      # set prompt cost on spans that have prompt tokens an a known model
      - set(span.attributes["{{ SEMCONV.LLM_USAGE_PROMPT_COST }}"],
          Double(span.attributes["{{ SEMCONV.LLM_USAGE_PROMPT_TOKENS }}"]) *
          span.cache["_input_costs"][span.attributes["{{ SEMCONV.LLM_RESPONSE_MODEL }}"]])
          where (
            span.attributes["{{ SEMCONV.LLM_USAGE_PROMPT_TOKENS }}"] != nil and
            span.attributes["{{ SEMCONV.LLM_RESPONSE_MODEL }}"] != nil and
            span.cache["_input_costs"][span.attributes["{{ SEMCONV.LLM_RESPONSE_MODEL }}"]] != nil)

      # set completion cost on spans that have completion tokens an a known model
      - set(span.attributes["{{ SEMCONV.LLM_USAGE_COMPLETION_COST }}"],
          Double(span.attributes["{{ SEMCONV.LLM_USAGE_COMPLETION_TOKENS }}"]) *
          span.cache["_output_costs"][span.attributes["{{ SEMCONV.LLM_RESPONSE_MODEL }}"]])
          where (
            span.attributes["{{ SEMCONV.LLM_USAGE_COMPLETION_TOKENS }}"] != nil and
            span.attributes["{{ SEMCONV.LLM_RESPONSE_MODEL }}"] != nil and
            span.cache["_output_costs"][span.attributes["{{ SEMCONV.LLM_RESPONSE_MODEL }}"]] != nil)
