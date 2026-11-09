"""
Swooshes de aire sintetizados (sin tambores ni tonos): ruido rosa suave que pasa por un filtro que se abre y se cierra,
con modulación lenta irregular, cola de reverberación y movimiento estéreo. Graves y suaves, para que no suenen robóticos.
Uso: node scripts/py.mjs sonidos.py <carpeta de salida>
"""
import numpy as np, wave, sys, os
SR=44100; rng=np.random.default_rng(11)
OUT=sys.argv[1]

def save(name, L, R, peak=0.6):
    x=np.stack([L,R],1); x=x/np.abs(x).max()*peak
    w=wave.open(os.path.join(OUT,name),'w'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype('<i2').tobytes()); w.close(); print(name, round(len(L)/SR,2),'s')

def pink(n):                                   # ruido rosa (1/f): mucho más natural que el blanco
    w=rng.standard_normal(n); f=np.fft.rfft(w); k=np.arange(len(f)); k[0]=1; f/=np.sqrt(k); x=np.fft.irfft(f,n); return x/np.abs(x).std()
def lp(x, fc):                                 # paso bajo de 2 polos (12 dB/oct) con corte variable: suave, sin siseo
    a=1-np.exp(-2*np.pi*np.minimum(fc,SR/3)/SR); y=np.zeros_like(x); s1=s2=0.0
    for i in range(len(x)): s1+=a[i]*(x[i]-s1); s2+=a[i]*(s1-s2); y[i]=s2
    return y
def hp(x, fc):
    a=1-np.exp(-2*np.pi*fc/SR); y=np.zeros_like(x); s=0.0
    for i in range(len(x)): s+=a*(x[i]-s); y[i]=x[i]-s
    return y
def wobble(n, depth=0.18, rate=7.0):           # variación lenta e irregular de volumen: evita el sonido "perfecto" y robótico
    z=lp(rng.standard_normal(n), np.full(n, rate)); z/=np.abs(z).std(); return 1+depth*z
def reverb(x, secs=0.4, mix=0.3):
    n=int(secs*SR); t=np.arange(n)/SR; ir=lp(rng.standard_normal(n), np.full(n, 2200))*np.exp(-t/(secs/3.2)); ir/=np.abs(ir).sum()
    m=len(x)+n; y=np.fft.irfft(np.fft.rfft(x,m)*np.fft.rfft(ir,m),m); return x*(1-mix)+y[:len(x)]*mix*4

def swoosh(dur, fc, env, pan, depth=0.18, rev=0.3, rev_secs=0.4):
    n=int(dur*SR); u=np.arange(n)/n; ch=[]
    for c in range(2):
        x=lp(pink(n), fc(u))*env(u)*wobble(n, depth)
        ch.append(reverb(hp(x, 45), rev_secs, rev))
    th=pan(u); return ch[0]*np.cos(th), ch[1]*np.sin(th)

# 1) SWOOSH medio (0.55 s): el aire se abre y se cierra, grave y suave. Izquierda→derecha y al revés
ENV1=lambda u: np.sin(np.pi*u**0.85)**1.5
FC1=lambda u: 240+1500*np.sin(np.pi*u**0.9)**1.6
for name,flip in (('SFX-swoosh-izq-der.wav',False),('SFX-swoosh-der-izq.wav',True)):
    pan=(lambda u: (np.pi/2-0.3-(np.pi/2-0.6)*u)) if flip else (lambda u: 0.3+(np.pi/2-0.6)*u)
    save(name, *swoosh(0.55, FC1, ENV1, pan, rev=0.28, rev_secs=0.35), 0.55)

# 2) SWOOSH grande (1.1 s) para la entrada de la música: ataque rápido y el filtro baja, como una ráfaga de aire (sin golpe)
ENV2=lambda u: (1-np.exp(-u*60))*np.exp(-u*3.2)
FC2=lambda u: 2600*(1-u)**2.2+190
save('SFX-swoosh-grande.wav', *swoosh(1.1, FC2, ENV2, lambda u: np.full_like(u, np.pi/4), depth=0.14, rev=0.4, rev_secs=0.6), 0.62)

# 3) SUBIDA de aire (3.42 s): el aire se abre poco a poco hacia la entrada y se hace un vacío justo antes
T=3.42; n=int(T*SR); k=np.arange(n)/n; ch=[]
for c in range(2):
    x=lp(pink(n), 180+6800*k**2.3)*(k**2.0)*wobble(n,0.12,5.0); ch.append(hp(x,40))
gate=np.ones(n); cut=int(0.1*SR); gate[-cut:]=np.linspace(1,0.03,cut)**2
save('SFX-subida-aire-3.4s.wav', ch[0]*gate, ch[1]*gate, 0.5)
