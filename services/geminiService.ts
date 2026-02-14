
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { RecognitionResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const analyzeMedicalDocument = async (base64Image: string): Promise<RecognitionResult> => {
  const prompt = `
    Analise esta imagem de uma receita médica. 
    1. Extraia o texto completo (corrigindo caligrafia cursiva).
    2. Identifique CRM ou CRO.
    3. Liste os nomes dos medicamentos.
    4. Use a ferramenta de busca para verificar se os medicamentos listados são reais e encontrar um link de referência confiável (ex: consulta remédios ou bula oficial).
    5. Crie um resumo simples para o paciente. Ex: "Tomar [Remédio] de 8 em 8 horas".

    Retorne um JSON com os campos: text, crm, cro, medications (array), summary, e references (array de objetos com title e uri).
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview', // Pro suporta melhor ferramentas de busca
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

  const responseText = response.text;
  if (!responseText) throw new Error("Resposta vazia da IA");
  
  return JSON.parse(responseText.trim()) as RecognitionResult;
};

export const generateSpeech = async (text: string): Promise<Uint8Array> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
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
