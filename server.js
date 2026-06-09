import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Verify API key exists on startup
if (!process.env.GEMINI_KEY) {
    console.error("❌ GEMINI_KEY not found in environment variables!");
    process.exit(1);
}

console.log("✅ GEMINI_KEY loaded");

function extractJSON(text) {
    try {
        // Remove markdown ```json and ```
        const cleaned = text
            .replace(/```json/g, "")
            .replace(/```/g, "")
            .trim();
        
        const start = cleaned.indexOf("[");
        const end = cleaned.lastIndexOf("]") + 1;
        
        if (start === -1 || end === 0) {
            console.error("❌ No JSON array found in response");
            return null;
        }
        
        const jsonStr = cleaned.slice(start, end);
        return JSON.parse(jsonStr);
    } catch (e) {
        console.error("❌ JSON parse failed:", e.message);
        return null;
    }
}

app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

app.post("/generate", async (req, res) => {
    try {
        console.log("📥 Received request:", req.body);

        const { name, interests, situation, decision, details } = req.body;

        // Validate input
        if (!name || !interests || !situation || !decision || !details) {
            return res.status(400).json({
                error: "Missing required fields",
                received: { name, interests, situation, decision, details }
            });
        }

        const prompt = `You are a creative storyteller. Based on the user's situation, generate 3 alternate life scenarios if they made different choices.

Return ONLY a valid JSON array (no markdown, no extra text). Each object must have these exact fields:
{
  "title": "short catchy title for this universe",
  "subtitle": "one line describing the alternate path",
  "description": "2-3 sentences about what happened in this universe",
  "careerPath": "what career they pursued",
  "keyEvents": ["event 1", "event 2", "event 3"],
  "outcome": "where they ended up - positive or negative"
}

User Details:
Name: ${name}
Interests: ${interests}
Current Situation: ${situation}
Big Decision: ${decision}
More Details: ${details}

Generate 3 diverse universes with different outcomes (one optimistic, one realistic, one cautionary). Return ONLY the JSON array.`;

        console.log("🔄 Calling Gemini API...");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        console.log("📤 Gemini API status:", response.status);

        if (!response.ok) {
            const errorData = await response.text();
            console.error("❌ Gemini API error:", errorData);
            return res.status(500).json({
                error: `Gemini API error: ${response.status}`,
                details: errorData.slice(0, 200) // First 200 chars
            });
        }

        const data = await response.json();
        console.log("📦 Gemini response received");

        // Extract text from Gemini response
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) {
            console.error("❌ No text in Gemini response:", JSON.stringify(data).slice(0, 200));
            return res.status(500).json({
                error: "No text returned from Gemini",
                raw: data
            });
        }

        console.log("📝 Extracted text length:", text.length);

        // Parse JSON from text
        const parsed = extractJSON(text);

        if (!parsed) {
            console.error("❌ Failed to parse JSON from text");
            return res.status(500).json({
                error: "Failed to parse JSON response",
                rawText: text.slice(0, 300)
            });
        }

        if (!Array.isArray(parsed)) {
            console.error("❌ Parsed result is not an array:", typeof parsed);
            return res.status(500).json({
                error: "Response is not an array",
                type: typeof parsed
            });
        }

        console.log("✅ Success! Generated", parsed.length, "universes");

        res.json({ universes: parsed });

    } catch (err) {
        console.error("❌ Server error:", err.message);
        console.error(err.stack);
        
        res.status(500).json({
            error: "Server error",
            message: err.message
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`💡 Health check: http://localhost:${PORT}/health`);
});
