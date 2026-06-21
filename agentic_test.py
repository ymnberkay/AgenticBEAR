from openai import OpenAI
client = OpenAI(base_url="http://localhost:5173/v1", api_key="agb_live_81f08b0390a3c671456a2a9c3dc45d7db3ef2e6b071dc234")
resp = client.chat.completions.create(
    model="Dh0V3Pa6ghvgL11xF4T6L/gemini-2.5-flash",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)