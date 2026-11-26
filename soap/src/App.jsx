import { useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import "./App.css";

const FINGERTIPS = Array.of(4, 8, 12, 16, 20);

function tocarSomPop(audioCtx) {
  if (!audioCtx) return;
  try {
    if (audioCtx.state === "suspended") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    const now = audioCtx.currentTime;
    osc.frequency.setValueAtTime(380 + Math.random() * 180, now);
    osc.frequency.exponentialRampToValueAtTime(950, now + 0.08);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {
    // Ignora bloqueios de audio
  }
}

export default function App() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [estado, setEstado] = useState("carregando");
  const [erroMsg, setErroMsg] = useState("");
  const [pontos, setPontos] = useState(0);

  const jogoRef = useRef({
    rodando: false,
    bolhas: [],
    particulas: [],
    ultimoSpawn: 0,
    handLandmarker: null,
    audioCtx: null,
    animId: null,
  });

  useEffect(() => {
    let ativo = true;

    async function carregarModelo() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://jsdelivr.net",
        );

        const modelUrl = "https://jsdelivr.net";

        let landmarker;
        try {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelUrl,
              delegate: "GPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
          });
        } catch {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelUrl,
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numHands: 2,
          });
        }

        if (!ativo) {
          landmarker.close();
          return;
        }
        jogoRef.current.handLandmarker = landmarker;
        setEstado("pronto");
      } catch (err) {
        if (ativo) {
          const detalhe = err?.message || String(err);
          setErroMsg("Erro ao carregar o modelo: " + detalhe);
          setEstado("erro");
        }
      }
    }

    carregarModelo();

    return () => {
      ativo = false;
      jogoRef.current.rodando = false;
      if (jogoRef.current.animId) cancelAnimationFrame(jogoRef.current.animId);
      if (jogoRef.current.handLandmarker)
        jogoRef.current.handLandmarker.close();
      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const iniciarJogo = async () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!jogoRef.current.audioCtx && AudioContext) {
        jogoRef.current.audioCtx = new AudioContext();
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: "user" },
        audio: false,
      });

      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();

      jogoRef.current.bolhas = [];
      jogoRef.current.particulas = [];
      jogoRef.current.ultimoSpawn = performance.now();
      jogoRef.current.rodando = true;
      setPontos(0);
      setEstado("jogando");

      loopJogo();
    } catch {
      setErroMsg(
        "Nao foi possivel aceder a camara. Verifique as permissoes do navegador.",
      );
      setEstado("erro");
    }
  };

  const criarBolha = (largura) => {
    const raio = 28 + Math.random() * 28;
    return {
      x: raio + Math.random() * (largura - raio * 2),
      y: -raio - 10,
      raio,
      velY: 1.4 + Math.random() * 2.0,
      faseOscilacao: Math.random() * Math.PI * 2,
      velOscilacao: 0.02 + Math.random() * 0.03,
      matiz: Math.floor(Math.random() * 360),
    };
  };

  const criarParticulas = (x, y, matiz) => {
    for (let i = 0; i < 14; i++) {
      const angulo = (Math.PI * 2 * i) / 14 + Math.random() * 0.3;
      const velocidade = 2 + Math.random() * 4.5;
      jogoRef.current.particulas.push({
        x,
        y,
        vx: Math.cos(angulo) * velocidade,
        vy: Math.sin(angulo) * velocidade,
        raio: 2 + Math.random() * 3.5,
        vida: 1.0,
        matiz: (matiz + i * 20) % 360,
      });
    }
  };

  const desenharBolhaSabao = (ctx, b) => {
    ctx.save();
    ctx.translate(b.x, b.y);

    const grad = ctx.createRadialGradient(
      -b.raio * 0.3,
      -b.raio * 0.3,
      b.raio * 0.1,
      0,
      0,
      b.raio,
    );
    grad.addColorStop(0, "rgba(255, 255, 255, 0.35)");
    grad.addColorStop(0.55, `hsla(${b.matiz}, 85%, 70%, 0.12)`);
    grad.addColorStop(0.85, `hsla(${(b.matiz + 120) % 360}, 90%, 65%, 0.35)`);
    grad.addColorStop(1, `hsla(${(b.matiz + 240) % 360}, 95%, 75%, 0.75)`);

    ctx.beginPath();
    ctx.arc(0, 0, b.raio, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 1.8;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.65)";
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      -b.raio * 0.38,
      -b.raio * 0.38,
      b.raio * 0.24,
      b.raio * 0.12,
      -Math.PI / 4,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(b.raio * 0.42, b.raio * 0.42, b.raio * 0.08, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fill();

    ctx.restore();
  };

  const loopJogo = () => {
    const state = jogoRef.current;
    if (!state.rodando) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (video.videoWidth && canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const largura = canvas.width;
    const altura = canvas.height;
    const agora = performance.now();

    ctx.clearRect(0, 0, largura, altura);

    const pontasDedos = [];
    if (state.handLandmarker && video.readyState >= 2) {
      const resultados = state.handLandmarker.detectForVideo(video, agora);
      if (resultados.landmarks) {
        for (const mao of resultados.landmarks) {
          for (const idx of FINGERTIPS) {
            const ponto = mao[idx];
            const px = (1 - ponto.x) * largura;
            const py = ponto.y * altura;
            pontasDedos.push({ x: px, y: py });

            ctx.beginPath();
            ctx.arc(px, py, 10, 0, Math.PI * 2);
            ctx.fillStyle = "rgba(0, 242, 254, 0.8)";
            ctx.shadowColor = "#00f2fe";
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }
    }

    if (agora - state.ultimoSpawn > 650) {
      state.bolhas.push(criarBolha(largura));
      state.ultimoSpawn = agora;
    }

    let pontosGanhos = 0;
    state.bolhas = state.bolhas.filter((b) => {
      b.y += b.velY;
      b.faseOscilacao += b.velOscilacao;
      b.x += Math.sin(b.faseOscilacao) * 1.1;
      b.matiz = (b.matiz + 0.6) % 360;

      const rebentou = pontasDedos.some((dedo) => {
        const dx = dedo.x - b.x;
        const dy = dedo.y - b.y;
        return Math.hypot(dx, dy) < b.raio + 12;
      });

      if (rebentou) {
        pontosGanhos += 10;
        criarParticulas(b.x, b.y, b.matiz);
        tocarSomPop(state.audioCtx);
        return false;
      }

      desenharBolhaSabao(ctx, b);
      return b.y - b.raio < altura + 20;
    });

    if (pontosGanhos > 0) {
      setPontos((p) => p + pontosGanhos);
    }

    state.particulas = state.particulas.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.vida -= 0.035;

      if (p.vida <= 0) return false;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.raio, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.matiz}, 90%, 75%, ${p.vida})`;
      ctx.fill();
      return true;
    });

    state.animId = requestAnimationFrame(loopJogo);
  };

  return (
    <div className="jogo-wrapper">
      <div className="palco">
        <video ref={videoRef} className="webcam-espelhada" playsInline muted />
        <canvas ref={canvasRef} className="camada-jogo" />

        {estado === "jogando" && (
          <div className="hud">
            <span className="titulo-hud">Bola de Soap Bubble</span>
            <span className="placar">Pontos: {pontos}</span>
          </div>
        )}

        {estado !== "jogando" && (
          <div className="overlay">
            <div className="cartao-inicio">
              <h1>Bola de Soap Bubble</h1>
              <p>
                Use as suas maos em frente a camara para rebentar as bolhas de
                sabao!
              </p>

              {estado === "carregando" && (
                <div className="status-msg">
                  A carregar inteligencia artificial das maos...
                </div>
              )}

              {estado === "pronto" && (
                <button className="btn-jogar" onClick={iniciarJogo}>
                  Ligar Camara e Jogar
                </button>
              )}

              {estado === "erro" && <div className="erro-msg">{erroMsg}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
