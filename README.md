# 🔍 Lupa Saúde Acessível

O **Lupa Saúde Acessível** é um aplicativo web progressivo (PWA) de impacto social, desenvolvido para auxiliar pessoas com baixa visão, idosos ou pessoas com dificuldades cognitivas a compreender receitas médicas e identificar registros profissionais (CRM/CRO).

Utilizando a inteligência artificial **Google Gemini**, o app resolve um problema histórico: a dificuldade de leitura de caligrafias médicas e a falta de acessibilidade em documentos de saúde.

## ✨ Funcionalidades Principais

- **🧠 Transcrição Inteligente (Vision IA):** Interpreta caligrafias cursivas complexas e converte em texto digital claro através do modelo `gemini-3-pro-preview`.
- **🌐 Validação via Google Search:** Cruza os medicamentos detectados com informações reais da web para garantir precisão e segurança.
- **🗣️ Leitura Assistiva (TTS):** Geração de áudio natural com `gemini-2.5-flash-preview-tts` para leitura do resumo da receita.
- **🔍 Lupa Digital com Zoom:** Controle deslizante de zoom (1x a 5x) otimizado para uso assistivo.
- **🌓 Modos de Contraste Avançados:** Temas "Invertido" e "Amarelo/Preto" (High Contrast) para facilitar a leitura.
- **📱 PWA (Progressive Web App):** Pode ser instalado no Android ou iOS para funcionar como um app nativo.

## 🚀 Como Iniciar

### Pré-requisitos
- Uma conta no [Google AI Studio](https://aistudio.google.com/) para obter sua `API_KEY`.

### Instalação Local
1. Clone este repositório:
   ```bash
   git clone https://github.com/leonardoaugustoicarus-png/Lupa-Sa-de-Acess-vel.git
   ```
2. Abra a pasta do projeto e utilize um servidor estático (como `npx serve .` ou a extensão Live Server do VS Code).

### Deploy no Vercel (Recomendado)
1. Conecte seu GitHub ao [Vercel](https://vercel.com).
2. Configure a Variável de Ambiente `API_KEY` com sua chave do Gemini.
3. O deploy será realizado automaticamente e o app estará pronto para uso.

## 🛠️ Tecnologias Utilizadas

- **React 19** + **TypeScript**
- **Tailwind CSS** (Interface moderna e acessível)
- **Google Gemini SDK** (`@google/genai`)
- **Vercel** (Hospedagem e CI/CD)

## ♿ Acessibilidade e Design

Este projeto segue diretrizes rigorosas de design inclusivo:
- **Áreas de toque:** Mínimo de 48x48px para facilitar a interação.
- **Tipografia:** Suporte a fontes dinâmicas de 20px até 60px.
- **Haptics:** Feedback de vibração para confirmação de ações de câmera e processamento.
- **Sem barreiras:** Acesso direto à câmera no carregamento inicial.

---
Desenvolvido por **Leonardo Augusto**. Focado em inovação tecnológica para inclusão e bem-estar social.