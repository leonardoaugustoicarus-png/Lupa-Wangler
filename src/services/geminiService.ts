
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { RecognitionResult } from "../types";

const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.warn("AVISO: Chave de API (GEMINI_API_KEY) não detectada. A análise não funcionará.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const analyzeMedicalDocument = async (base64Image: string): Promise<RecognitionResult> => {
  const prompt = `
    Contexto: O usuário está no Brasil (São Paulo) e possui baixa visão. Sua tarefa é analisar esta receita médica com precisão cirúrgica.
    
    INSTRUÇÕES:
    1. TEXTO: Extraia todo o texto, corrigindo letras cursivas e rasuradas. Se algo estiver ilegível, tente deduzir pelo contexto médico.
    2. PROFISSIONAL: Identifique o NOME COMPLETO e o registro (CRM ou CRO) do profissional, focando em registros do estado de São Paulo (SP).
    3. INCERTEZA: Se o número de registro estiver borrado ou rasurado, identifique as "possibilities" aproximadas (ex: se ler "12_45", liste ["12045", "12845"]).
    4. MEDICAMENTOS: Liste os nomes EXATOS dos medicamentos.
    5. PESQUISA: Use a busca para validar se o medicamento existe no mercado brasileiro e para confirmar dados do profissional se possível.
    6. RESUMO ACESSÍVEL: Crie um guia de uso extremamente simples.
       - Use frases curtas como "Tomar 1 comprimido de 8 em 8 horas".
       - ADICIONE SEMPRE esta nota de segurança: "IMPORTANTE: Este resumo é gerado por IA. Sempre confirme com a receita física e seu médico antes de tomar o remédio."
    
    Retorne um JSON com os campos: text, crm, cro, professionalName, possibilities (array), medications (array), summary, e references (array de objetos com title e uri).
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-1.5-flash',
    contents: [
      {
        parts: [
          { inlineData: { data: base64Image, mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      }
    ],
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          crm: { type: Type.STRING },
          cro: { type: Type.STRING },
          professionalName: { type: Type.STRING },
          possibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
          medications: { type: Type.ARRAY, items: { type: Type.STRING } },
          summary: { type: Type.STRING },
          references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                uri: { type: Type.STRING }
              }
            }
          }
        },
        required: ["text", "medications", "summary"]
      }
    }
  });

  if (!response || !response.text) {
    throw new Error("Não foi possível obter uma resposta válida da inteligência artificial.");
  }

  try {
    return JSON.parse(response.text.trim()) as RecognitionResult;
  } catch (e) {
    console.error("Erro ao processar JSON da IA:", e, response.text);
    throw new Error("Falha ao processar os dados da receita. Tente uma foto mais nítida.");
  }
};

export const generateSpeech = async (text: string): Promise<Uint8Array> => {
  const response = await ai.models.generateContent({
    model: "gemini-1.5-flash", // Usando Flash 1.5 para maior compatibilidade
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Puck' }, // Puck/Charon/Kore são vozes válidas
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("Falha ao gerar áudio");

  return decodeBase64(base64Audio);
};

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
