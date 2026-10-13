# AI providers

The console assistant, the project draft of the new project wizard and
[editing a microfrontend with AI](AI-CODE-CHANGES.md) all use one model, chosen per installation with
`AI_PROVIDER`. With no provider configured AI is off: the assistant is hidden, its endpoints answer
404 and nothing is sent anywhere.

| `AI_PROVIDER`   | Model                              | Required variables                                                                                     | Optional                                   |
| --------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `anthropic`     | Claude, Anthropic API              | `ANTHROPIC_API_KEY`                                                                                    | `ANTHROPIC_MODEL` (`claude-opus-5-5`)      |
| `azure-foundry` | Claude on Microsoft Foundry        | `AZURE_FOUNDRY_RESOURCE`, `AZURE_FOUNDRY_API_KEY`                                                      | `AZURE_FOUNDRY_MODEL` (`claude-opus-5-5`)  |
| `gemini`        | Gemini, Gemini API                 | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                       |                                            |
| `azure-openai`  | GPT on Azure OpenAI                | `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION` | `AZURE_OPENAI_REASONING` (`false`)         |

`AI_PROVIDER` left empty with `ANTHROPIC_API_KEY` set keeps working as before: Claude through the
Anthropic API. A provider named without one of its required variables stops the backend at boot,
with the missing variables in the error.

## Notes per provider

- **anthropic**: requests that Claude declines are retried on another model by the API itself
  (server-side fallback).
- **azure-foundry**: `AZURE_FOUNDRY_RESOURCE` is the resource name, as in
  `https://<resource>.services.ai.azure.com`; `AZURE_FOUNDRY_MODEL` is the name of the Claude
  deployment. Foundry has no server-side fallback, so a declined request is reported as declined.
- **gemini**: `GEMINI_MODEL` has no default, because Gemini models are retired often. Use a model
  with function calling, such as a current Gemini Pro.
- **azure-openai**: `AZURE_OPENAI_ENDPOINT` is `https://<resource>.openai.azure.com/` and
  `AZURE_OPENAI_DEPLOYMENT` the name of the GPT deployment. Set `AZURE_OPENAI_REASONING=true` for
  reasoning models (GPT-5, o-series): the effort is then sent as `reasoning_effort`; other models
  reject it.

Authentication is by API key on every provider. The quality of the assistant and above all of
the code agent depends on the model: the prompts and tools were written and tested with Claude.
