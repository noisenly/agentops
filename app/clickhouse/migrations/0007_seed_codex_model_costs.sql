-- API-equivalent estimates for Codex model telemetry; ChatGPT subscription billing is separate.
INSERT INTO otel_2.model_costs_source (model, prompt_cost_per_1k, completion_cost_per_1k) VALUES
('gpt-5.6-terra', 0.00200, 0.01200),
('gpt-5.6-luna', 0.00020, 0.00120);

SYSTEM RELOAD DICTIONARY otel_2.model_costs_dict;
