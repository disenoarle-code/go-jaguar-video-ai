"""
Sonidos para las escenas animadas (propios, libres de derechos, sin descargar nada):
  SFX-tecleo.wav   teclas de un teclado (clic agudo + golpe grave suave), con ritmo irregular de escritura
  SFX-temblor.wav  retumbo grave con vibración rápida (cámara que tiembla); sube y baja suave
  SFX-suspiro.wav  soplo de aire que se apaga (momento triste); sin tonos
Reglas del usuario: nada de tambores ni golpes secos ni campanitas; suaves, nada robóticos.
Uso: node scripts/py.mjs sonidos-escenas.py <carpeta de salida>
"""
import numpy as np, wave, sys, os
SR=44100; rng=np.random.default_rng(23)
OUT=sys.argv[1]
def save(name, L, R, peak=0.5):
    x=np.stack([L,R],1); x=x/np.abs(x).max()*peak
    w=wave.open(os.path.join(OUT,name),'w'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype('<i2').tobytes()); w.close(); print(name, round(len(L)/SR,2),'s')
def pink(n):
    w=rng.standard_normal(n); f=np.fft.rfft(w); k=np.arange(len(f)); k[0]=1; f/=np.sqrt(k); x=np.fft.irfft(f,n); return x/np.abs(x).std()
def lp(x, fc):
    fc=np.broadcast_to(np.asarray(fc,dtype=float),x.shape); a=1-np.exp(-2*np.pi*np.minimum(fc,SR/3)/SR); y=np.zeros_like(x); s1=s2=0.0
    for i in range(len(x)): s1+=a[i]*(x[i]-s1); s2+=a[i]*(s1-s2); y[i]=s2
    return y
def hp(x, fc):
    a=1-np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); s=0.0
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=x[i]-s
    return y
def wobble(n, depth=0.18, rate=7.0):
    z=lp(rng.standard_normal(n), np.full(n, rate)); z/=np.abs(z).std(); return 1+depth*z
def reverb(x, secs=0.4, mix=0.3):
    n=int(secs*SR); t=np.arange(n)/SR; ir=lp(rng.standard_normal(n), np.full(n, 2200))*np.exp(-t/(secs/3.2)); ir/=np.abs(ir).sum()
    m=len(x)+n; y=np.fft.irfft(np.fft.rfft(x,m)*np.fft.rfft(ir,m),m); return x*(1-mix)+y[:len(x)]*mix*4

# 1) TECLEO (5 s): palabras de 3-7 teclas, 70-160 ms entre teclas, pausas de 0.2-0.6 s; algunas teclas más fuertes
def tecla(fuerte):
    n=int(0.09*SR); t=np.arange(n)/SR
    clic=hp(lp(rng.standard_normal(n), np.full(n, 5200)), 1800)*np.exp(-t/0.0045)
    golpe=lp(rng.standard_normal(n), np.full(n, 520 if fuerte else 700))*np.exp(-t/0.016)*(1.1 if fuerte else 0.7)
    return clic*0.8+golpe
DUR=5.0; N=int(DUR*SR); L=np.zeros(N); R=np.zeros(N); t=0.25
while t<DUR-0.3:
    for _ in range(int(rng.integers(3,8))):
        k=tecla(rng.random()<0.18)*rng.uniform(0.55,1.0); i=int(t*SR); pan=rng.uniform(-0.35,0.35)
        seg=k[:N-i]; L[i:i+len(seg)]+=seg*(1-pan)/2+seg*0.5*0; R[i:i+len(seg)]+=seg*(1+pan)/2
        t+=rng.uniform(0.07,0.16)
    t+=rng.uniform(0.2,0.6)
save('SFX-tecleo.wav', reverb(L,0.18,0.18), reverb(R,0.18,0.18), 0.5)

# 2) TEMBLOR (3.2 s): retumbo grave + vibración rápida irregular, entra y sale suave (nada de golpe)
dur=3.2; n=int(dur*SR); u=np.arange(n)/n; env=np.minimum(1,u/0.08)*np.minimum(1,(1-u)/0.18)
ch=[]
for c in range(2):
    low=lp(pink(n), np.full(n,130))*1.0
    vib=lp(hp(pink(n), 180), np.full(n,900))*(0.5+0.5*np.clip(wobble(n,0.7,15),0,2))*0.35
    ch.append(reverb((low+vib)*env*wobble(n,0.15,5),0.5,0.3))
save('SFX-temblor.wav', ch[0], ch[1], 0.55)

# 3) SUSPIRO (1.9 s): soplo de aire que se apaga, el filtro baja (triste), sin tono
dur=1.9; n=int(dur*SR); u=np.arange(n)/n
env=(1-np.exp(-u*14))*np.exp(-u*2.2); fc=1700*np.exp(-u*1.9)+200
ch=[reverb(hp(lp(pink(n), fc)*env*wobble(n,0.22,6),60),0.7,0.38) for _ in range(2)]
save('SFX-suspiro.wav', ch[0], ch[1], 0.5)

# 4) GOLPE DE AIRE (0.6 s): el muñeco te da en la cabeza. Soplido sordo con cuerpo grave que se apaga rápido; sin tono ni tambor
dur=0.6; n=int(dur*SR); u=np.arange(n)/n; tt=u*dur
env_aire=(1-np.exp(-tt*900))*np.exp(-tt*16); env_grave=(1-np.exp(-tt*500))*np.exp(-tt*9)
ch=[]
for c in range(2):
    aire=lp(hp(pink(n),180), 1800*np.exp(-tt*5)+300)*env_aire
    grave=lp(pink(n), np.full(n,150))*env_grave*1.6
    ch.append(reverb(aire*0.9+grave, 0.35, 0.25))
save('SFX-golpe-aire.wav', ch[0], ch[1], 0.6)
