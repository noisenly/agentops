INSERT INTO otel_2.model_costs_source (model, prompt_cost_per_1k, completion_cost_per_1k) VALUES
('gpt-5.4-nano', 0.00020, 0.00125);

SYSTEM RELOAD DICTIONARY otel_2.model_costs_dict;
