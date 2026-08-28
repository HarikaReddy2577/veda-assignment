import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { questionText, answerText } = await req.json();

    if (!answerText) {
      return NextResponse.json({
        score: 0,
        maxScore: 5,
        correct: false,
        feedback: "No answer was provided for this question.",
      });
    }

    const prompt = `You are grading a student's answer. Question: "${questionText}". Student's answer: "${answerText}". Respond ONLY with JSON, no prose, no markdown fences, in this exact format: {"score": <number out of 5>, "maxScore": 5, "correct": <true or false>, "feedback": "<one short sentence of feedback>"}`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { score: 0, maxScore: 5, correct: false, feedback: "Could not grade this answer." };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Grading failed" }, { status: 500 });
  }
}