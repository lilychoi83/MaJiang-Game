import { GoogleGenAI, Type } from "@google/genai";
import { AiAdvice } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelName = "gemini-2.5-flash";

const tileToKoreanName = (char: string): string => {
  const code = char.codePointAt(0);
  if (!code) return char;

  if (code >= 0x1F007 && code <= 0x1F00F) return `${code - 0x1F007 + 1}만`; // Manzu
  if (code >= 0x1F010 && code <= 0x1F018) return `${code - 0x1F010 + 1}삭`; // Souzu
  if (code >= 0x1F019 && code <= 0x1F021) return `${code - 0x1F019 + 1}통`; // Pinzu
  
  const honorMap: Record<number, string> = {
    0x1F000: '동(East)', 
    0x1F001: '남(South)', 
    0x1F002: '서(West)', 
    0x1F003: '북(North)',
    0x1F004: '중(Red)', 
    0x1F005: '발(Green)', 
    0x1F006: '백(White)',
  };
  return honorMap[code] || char;
};

export const getAiCoachAdvice = async (hand: string[], drawnTile: string | null): Promise<AiAdvice> => {
  const fullHand = drawnTile ? [...hand, drawnTile] : hand;
  // Convert tiles to explicit text names to avoid AI confusion
  const handDescription = fullHand.map(tileToKoreanName).join(', ');
  
  const prompt = `
    You are a friendly, expert Riichi Mahjong Instructor.
    The student needs help deciding what to discard.
    
    Student's Hand: [${handDescription}]
    
    Your Goal:
    Analyze the hand for "Tile Efficiency" (Tenpai speed) and "Yaku" (scoring potential).
    
    Output JSON with:
    1. suggestion: The specific tile to discard (write the name in Korean, e.g., "1만", "북").
    2. reason: A concise, helpful explanation in Korean. Explain WHY based on shapes or yaku.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            suggestion: { type: Type.STRING, description: "Tile to discard in Korean" },
            reason: { type: Type.STRING, description: "Explanation in Korean" },
          },
          required: ["suggestion", "reason"],
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response");
    return JSON.parse(text) as AiAdvice;
  } catch (error) {
    console.error("AI Error:", error);
    return {
      suggestion: "패 정리하기",
      reason: "잠시 연결이 원활하지 않네요. 고립된 자패나 1, 9패부터 정리해보세요.",
    };
  }
};