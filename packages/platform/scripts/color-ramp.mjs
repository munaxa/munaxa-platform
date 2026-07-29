// sRGB <-> OKLab/OKLCH
const f=(c)=>c<=0.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-0.055;
const fi=(c)=>c<=0.04045?c/12.92:Math.pow((c+0.055)/1.055,2.4);
function hexToRgb(h){h=h.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);}
function rgbToHex(r){return '#'+r.map(v=>Math.round(Math.min(1,Math.max(0,v))*255).toString(16).padStart(2,'0')).join('').toUpperCase();}
function srgbToOklab([R,G,B]){const r=fi(R),g=fi(G),b=fi(B);
 const l=Math.cbrt(0.4122214708*r+0.5363325363*g+0.0514459929*b);
 const m=Math.cbrt(0.2119034982*r+0.6806995451*g+0.1073969566*b);
 const s=Math.cbrt(0.0883024619*r+0.2817188376*g+0.6299787005*b);
 return [0.2104542553*l+0.7936177850*m-0.0040720468*s,
         1.9779984951*l-2.4285922050*m+0.4505937099*s,
         0.0259040371*l+0.7827717662*m-0.8086757660*s];}
function oklabToSrgb([L,a,bb]){const l=(L+0.3963377774*a+0.2158037573*bb)**3;
 const m=(L-0.1055613458*a-0.0638541728*bb)**3;
 const s=(L-0.0894841775*a-1.2914855480*bb)**3;
 return [f(+4.0767416621*l-3.3077115913*m+0.2309699292*s),
         f(-1.2684380046*l+2.6097574011*m-0.3413193965*s),
         f(-0.0041960863*l-0.7034186147*m+1.7076147010*s)];}
export const toLch=(hex)=>{const [L,a,b]=srgbToOklab(hexToRgb(hex));return {L,C:Math.hypot(a,b),h:Math.atan2(b,a)};};
export const fromLch=({L,C,h})=>rgbToHex(oklabToSrgb([L,C*Math.cos(h),C*Math.sin(h)]));

const STEPS=[50,100,200,300,400,500,600,700,800,900,950];
const L_LIGHT=0.975, L_DARK=0.235;
const CT=[0.10,0.20,0.40,0.61,0.82,1.00,0.98,0.90,0.78,0.62,0.48];
export function ramp(brandHex, anchorStep){
  const b=toLch(brandHex);
  const ai=STEPS.indexOf(anchorStep);
  const n=STEPS.length-1;
  // Piecewise-linear lightness that passes exactly through the brand at its anchor step.
  const L=STEPS.map((_,i)=> i<=ai
    ? L_LIGHT + (b.L-L_LIGHT)*(i/ai)
    : b.L + (L_DARK-b.L)*((i-ai)/(n-ai)));
  const cMax=b.C/CT[ai];
  const out={};
  STEPS.forEach((s,i)=>{ out[s]= i===ai ? brandHex.toUpperCase() : fromLch({L:L[i],C:cMax*CT[i],h:b.h}); });
  return out;
}
