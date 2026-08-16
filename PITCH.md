# PITCH — Categoría: Dinero y Acceso Financiero

MusicTokenRing ya conecta a artistas independientes con fans reales de todo el
mundo a través de batallas musicales financiadas con cripto (NOWPayments +
token MTR en Base); lo que faltaba era operarlo sin un equipo humano detrás
de cada paso del dinero. Con esta capa de agentes de IA nativos en Google
Cloud, MTR se convierte en una plataforma financiera **auto-operada**: un
agente Scout (Gemini + Vertex AI) monitorea Deezer en tiempo real y recluta
artistas en crecimiento sin que nadie tenga que buscarlos; un agente CFO
recibe cada pago confirmado, calcula el split 95/5 artista/plataforma, valida
la wallet de cobro contra la base de datos —no contra lo que diga la
solicitud entrante, la misma lección que ya aprendimos de un incidente real
de seguridad documentado en este repo— y paga automáticamente respetando
topes y un circuit breaker, dejando cada transacción auditada en BigQuery
para un P&L en vivo; y un agente Host narra las batallas y anima a votar en
tiempo real. El resultado es acceso financiero real y sin fricción para
artistas que hoy no tienen forma de monetizar su música directamente desde
sus fans, operado con la disciplina de un equipo financiero profesional pero
a la velocidad y el costo de una función serverless.
