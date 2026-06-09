import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Verify API token exists on startup
if (!process.env.HUGGINGFACE_TOKEN) {
    console.error("❌ HUGGINGFACE_TOKEN not found in environment variables!");
    process.exit(1);
}

console.log("✅ HUGGINGFACE_TOKEN loaded");

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
        console.log("📥 Received request");

        const { name, interests, situation, decision, details } = req.body;

        // Validate input
        if (!name || !interests || !situation || !decision || !details) {
            return res.status(400).json({
                error: "Missing required fields",
                received: { name, interests, situation, decision, details }
            });
        }

        const prompt = `You are a creative storyteller. Generate 3 alternate life scenarios as JSON.

Return ONLY this JSON format (no markdown, no text before or after):
[
  {
    "title": "short title",
    "subtitle": "one line description",
    "description": "2-3 sentences",
    "careerPath": "career choice",
    "keyEvents": ["event1", "event2", "event3"],
    "outcome": "result"
  },
  {
    "title": "short title",
    "subtitle": "one line description",
    "description": "2-3 sentences",
    "careerPath": "career choice",
    "keyEvents": ["event1", "event2", "event3"],
    "outcome": "result"
  },
  {
    "title": "short title",
    "subtitle": "one line description",
    "description": "2-3 sentences",
    "careerPath": "career choice",
    "keyEvents": ["event1", "event2", "event3"],
    "outcome": "result"
  }
]

Person: ${name}
Interests: ${interests}
Current Situation: ${situation}
Decision: ${decision}
Details: ${details}

Create 3 diverse universes (optimistic, realistic, cautionary). Output ONLY the JSON array:`;

        console.log("🔄 Calling HuggingFace API...");

        const response = await fetch(
            "https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.1",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.HUGGINGFACE_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 1500,
                        temperature: 0.7,
                        top_p: 0.9
                    }
                })
            }
        );

        console.log("📤 HuggingFace API status:", response.status);

        if (!response.ok) {
            const errorData = await response.text();
            console.error("❌ HuggingFace API error:", response.status, errorData.slice(0, 200));
            return res.status(500).json({
                error: `HuggingFace API error: ${response.status}`,
                details: errorData.slice(0, 200)
            });
        }

        const data = await response.json();
        console.log("📦 HuggingFace response received");

        // HuggingFace returns an array with { generated_text: "..." }
        let text = null;

        if (Array.isArray(data) && data[0]?.generated_text) {
            text = data[0].generated_text;
        } else if (data.generated_text) {
            text = data.generated_text;
        }

        if (!text) {
            console.error("❌ No text in HuggingFace response:", JSON.stringify(data).slice(0, 200));
            return res.status(500).json({
                error: "No text returned from HuggingFace",
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
