![alt text](image.png)

L0 — Context Compression → girdi_token'ı azaltır
Gönderdiğin metni modele ulaşmadan önce küçültür: fazla boşluğu siler, JSON'ı minify eder, tekrar eden satırları toplar (⟪×150⟫), büyük tool çıktısını head+tail kırpar.

Örnek: 150 tekrar log satırı → ~1313 token yerine ~15 token (demo'da gördük).
Sonuç: aynı çağrı, ama girdi tarafı %30–99 daha küçük → daha az girdi_token.
L1 — Semantic Cache → çağrıyı sıfırlar
Soruyu embedding'e çevirip Qdrant'ta benzerini arar. Benzerlik ≥0.90 ise (0.80–0.90 arası judge "aynı soru mu?" diye onaylarsa) kayıttaki cevabı döner — LLM'e hiç gitmez.

Örnek: "Valkey nedir?" 1. çağrı: tam fiyat. 2. çağrı (ya da "Valkey'i anlat" paraphrase'i): hit → cost $0. O çağrının hem girdi hem çıktı token'ı = 0.
Sonuç: tekrarlı/benzer trafikte çağrı başına %100 (denklemin tamamı silinir).
L2 — Level Router → token başına fiyatı düşürür
Küçük/ucuz bir classifier işin karmaşıklığını 1–10 puanlar; modellere verdiğin seviyeye göre, karmaşıklığı karşılayan en ucuz modeli seçer (istenen model = tavan, asla yukarı çıkmaz).

Örnek: Pahalı modele "2+2 kaç?" → router bunu basit görüp nano'ya yönlendirir. Token sayısı ~aynı ama token fiyatı çok daha düşük.
Sonuç: "her şeyi güçlü modele soruyorum" senaryosunda basit sorular ucuz modele kayar (canlı ~%69 görmüştük).
L3 — Prompt Cache → tekrarlı girdi token'ının fiyatını düşürür
Uzun, sabit system prefix'ini sağlayıcı cache'ler (Anthropic cache_control / OpenAI-Azure otomatik cached_tokens). Cache'lenen girdi token'ı tam fiyat değil ~%10 (Anthropic) / ~%50 (OpenAI) ödenir. Biz cached_tokens'ı okuyup bu indirimi kredilendiriyoruz.

Örnek: 2000 token'lık system prompt her turda gönderiliyor. 1. çağrıda "cache oluşturma", 2. çağrıdan sonra o 2000 token yarı/onda bir fiyata → çağrı başına ~%47 (canlı gördük).
Sonuç: girdi token sayısı aynı kalır ama o token'ların fiyatı düşer.
L4 — Output Minimization → çıktı_token'ı azaltır
Modele bir system direktifi ekler ("tembel kıdemli dev: gereksiz/over-engineer kod yazma, kısa ol"). Model daha az üretir → daha az çıktı token. (Bu sayaç bazlı ölçülemez çünkü "yazmasaydı ne kadar yazardı" bilinmez — counterfactual.)

Örnek: 400 satırlık over-engineer çözüm → 23 satır (referans benchmark ~%20 token).
Sonuç: denklemin çıktı tarafını kısar (diğerleri girdi/fiyat tarafını).
Ek mekanizmalar (agentic)
Tool-result cache: aynı read_file/list_files tekrar çağrılırsa diskten okumaz, sonucu cache'ten verir (tool tekrar-çalıştırmayı önler).
Agentic answer-cache: chat'te araç kullanmayan saf-cevap turn'leri L1'e yazar → tekrar eden soru bedava (L1'in agentic karşılığı, canlı ~%50).