import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const type = formData.get("type") as string; // "question" or "answer"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");

    const prompt =
      type === "question"
        ? `You are analyzing a scanned question paper. Extract every question in printed order as JSON only, no prose, no markdown fences. Format: {"questions":[{"number":"1","text":"..."}]}. Treat labelled sub-parts like 11(a) and 11(b) as separate entries.`
        : `You are analyzing a scanned handwritten answer sheet. Extract each distinct answer block as JSON only, no prose, no markdown fences. Format: {"answers":[{"label":"1","text":"...","bbox":{"x":0,"y":0,"width":0,"height":0}}]}. The bbox values must be percentages (0-100) of the full image describing a rectangle tightly around that answer's handwriting, where x/y is the top-left corner. If a block has no visible question label, set label to null.`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: file.type,
                    data: base64,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await response.json();
    console.log("RAW GEMINI RESPONSE:", JSON.stringify(data));

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { error: "Could not parse model output", raw: text };
    }

    return NextResponse.json(parsed);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Extraction failed" }, { status: 500 });
  }
}