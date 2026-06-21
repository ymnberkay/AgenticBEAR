from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:5173/v1",
    api_key="agb_live_d52c55d01a5801510409cec3d08a64d3"
)

messages = []

print("Chat başladı (çıkmak için: exit)\n")

while True:
    user_input = input("Sen: ")

    if user_input.lower() in ["exit", "quit"]:
        break

    messages.append({
        "role": "user",
        "content": user_input
    })

    resp = client.chat.completions.create(
        model="EjhPznYlakdvTFvZ-11Ij/DeepSeek-V4-Flash",
        messages=messages
    )

    answer = resp.choices[0].message.content

    print("Bot:", answer, "\n")

    messages.append({
        "role": "assistant",
        "content": answer
    })