import numpy as np, wave, sys, os
SR=44100; rng=np.random.default_rng(7)
OUT=sys.argv[1]
def save(name, L, R, peak=0.7):
    x=np.stack([L,R],1); m=np.abs(x).max(); x=x/m*peak
    w=wave.open(os.path.join(OUT,name),'w'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype('<i2').tobytes()); w.close(); print(name, round(len(L)/SR,2),'s')
def lowpass_tv(x, fc):   # paso bajo de un polo con corte variable (Hz por muestra)
    a=1-np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); s=0.0
    for i in range(len(x)): s+=a[i]*(x[i]-s); y[i]=s
    return y
def bandpass_tv(x, fc, q=2.5):   # filtro de variables de estado (Chamberlin): sube y baja de tono
    f=2*np.sin(np.pi*np.minimum(fc,SR/6)/SR); lo=bp=0.0; y=np.zeros_like(x)
    for i in range(len(x)):
        lo+=f[i]*bp; hi=x[i]-lo-bp/q; bp+=f[i]*hi; y[i]=bp
    return y
def env(t,a,d): return np.clip(t/a,0,1)**2*np.exp(-np.maximum(t-a,0)/d)

# 1) SUBIDA (riser) de 3.42 s: ruido que se abre + tono que sube; en los últimos 90 ms se hace el vacío antes del impacto
T=3.42; n=int(T*SR); t=np.arange(n)/SR; k=t/T
f=170*(1800/170)**k; ph=2*np.pi*np.cumsum(f)/SR
tone=(np.sin(ph)+0.5*np.sin(2*ph)+0.25*np.sin(3*ph))*k**1.6*0.28
chans=[]
for c in range(2):
    nz=lowpass_tv(rng.standard_normal(n), 250+9500*k**2)*(k**2.2)*1.4
    chans.append(nz+tone*(0.9 if c==0 else 1.0))
gate=np.ones(n); cut=int(0.09*SR); gate[-cut:]=np.linspace(1,0.04,cut)**2
save('SFX-subida-3.4s.wav', chans[0]*gate, chans[1]*gate, 0.75)

# 2) IMPACTO grave (2.4 s): golpe + sub + cuerpo + cola
n=int(2.4*SR); t=np.arange(n)/SR
sub=np.sin(2*np.pi*np.cumsum(38+60*np.exp(-t*9))/SR)*np.exp(-t/0.85)
body=lowpass_tv(rng.standard_normal(n), 2600*np.exp(-t*7)+120)*np.exp(-t/0.22)*1.3
crack=rng.standard_normal(n)*np.exp(-t/0.012)*0.7
tail=[lowpass_tv(rng.standard_normal(n), 900*np.exp(-t*1.6)+150)*np.exp(-t/0.8)*0.5 for _ in range(2)]
L=np.tanh((sub*1.5+body+crack+tail[0])*1.4); R=np.tanh((sub*1.5+body*0.95+crack+tail[1])*1.4)
save('SFX-impacto.wav', L, R, 0.92)

# 3) WHOOSH (0.75 s), de izquierda a derecha y al revés
def whoosh(rev):
    n=int(0.75*SR); t=np.arange(n)/SR; fc=450*(3800/450)**(t/0.75)
    e=np.clip(t/0.3,0,1)**2*np.exp(-np.maximum(t-0.3,0)/0.16); e=np.sin(np.pi*np.minimum(t/0.75,1))**1.6*0.7+e*0.5
    x=bandpass_tv(rng.standard_normal(n), fc, q=7)
    x=lowpass_tv(x, 5200*np.ones(n))*e*1.8
    th=np.linspace(0,np.pi/2,n); th=th[::-1] if rev else th
    return x*np.cos(th), x*np.sin(th)
save('SFX-whoosh-izq-der.wav', *whoosh(False), 0.7); save('SFX-whoosh-der-izq.wav', *whoosh(True), 0.7)

# 4) BRILLO (destello): campana con parciales altos + chispa de ruido
n=int(1.0*SR); t=np.arange(n)/SR; sig=np.zeros(n)
for f0,a,d in [(2093,1,0.55),(3136,0.7,0.4),(4186,0.5,0.28),(6272,0.3,0.18),(8372,0.18,0.1)]: sig+=a*np.sin(2*np.pi*f0*t)*np.exp(-t/d)
spark=lowpass_tv(rng.standard_normal(n), 9000+0*t)*np.exp(-t/0.03)*0.5
L=sig+spark; R=np.roll(sig,60)+spark*0.9
save('SFX-brillo.wav', L, R, 0.55)
