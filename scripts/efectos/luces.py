import numpy as np, subprocess, sys
W,H,FPS=540,960,30
yy,xx=np.mgrid[0:H,0:W].astype(np.float32); xx/=W; yy/=H
def leak(name, dur, blobs, seed):
    rng=np.random.default_rng(seed); n=int(dur*FPS)
    p=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-c:v','libx264','-crf','12','-pix_fmt','yuv420p',name],stdin=subprocess.PIPE)
    for i in range(n):
        u=i/(n-1); env=np.sin(np.pi*u)**1.8             # sube y baja, sin cortes
        img=np.zeros((H,W,3),np.float32)
        for (x0,y0,x1,y1,r,col,k) in blobs:
            cx=x0+(x1-x0)*u; cy=y0+(y1-y0)*u
            d2=((xx-cx)**2*(H/W)**2+(yy-cy)**2)/(r*r)
            g=np.exp(-d2*2.2)*k
            img+=g[...,None]*np.array(col,np.float32)/255.0
        img=1-np.exp(-img*1.6*env)                          # suaviza los blancos (como una película quemada)
        img+= rng.normal(0,0.004,img.shape).astype(np.float32)   # un poco de grano
        p.stdin.write((np.clip(img,0,1)*255).astype(np.uint8).tobytes())
    p.stdin.close(); p.wait()
D=sys.argv[1]
leak(f'{D}/LUZ-calida.mp4',1.5,[(-.3,.1,1.2,.5,.55,(255,120,30),1.0),(1.3,.8,-.2,.35,.5,(255,45,100),.9),(.4,-.2,.7,1.1,.35,(255,215,120),.7)],3)
leak(f'{D}/LUZ-fria.mp4',1.5,[(1.3,.2,-.3,.7,.55,(40,200,255),1.0),(-.3,.9,1.2,.3,.5,(120,60,255),.9),(.6,1.2,.3,-.2,.35,(190,240,255),.7)],5)
leak(f'{D}/LUZ-dorada.mp4',1.2,[(-.2,.5,1.2,.4,.6,(255,190,60),1.0),(.5,-.2,.5,1.2,.4,(255,240,200),.8)],9)
