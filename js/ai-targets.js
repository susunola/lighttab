// Site-specific AI composer adapters. Keep selectors and submission policy outside the transport
// script so an upstream DOM change is one small, reviewable update rather than a risky edit to the
// nonce and prompt-delivery flow.
globalThis.LT_AI_TARGETS = Object.freeze({
  doubao: Object.freeze({ hosts: ['www.doubao.com', 'www.dola.com'], enterFirst: false, extraInputs: [] }),
  openai: Object.freeze({ hosts: ['chatgpt.com', 'chat.openai.com'], enterFirst: true,
    extraInputs: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]'] }),
  deepseek: Object.freeze({ hosts: ['chat.deepseek.com'], enterFirst: true,
    extraInputs: ['textarea#chat-input', 'textarea[placeholder]'] })
});
