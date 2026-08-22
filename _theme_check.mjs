globalThis.document={createElement:()=>({getContext:()=>({set fillStyle(v){this._v=v},get fillStyle(){return '#2743f2'}})})};
const t=await import('./src/lib/theme.js');
console.log(t.familyDisplayName('hsl(272, 72%, 60%)'), '|', t.familyDisplayName('blue'), '|', t.familyDisplayName('hsl(10, 50%, 50%)'));
console.log(t.themeVarsForFamily('hsl(272, 72%, 76%)'));
console.log(t.colourToThemeKey('#2743f2'), t.isValidThemeKey('hsl(1, 2%, 3%)'), t.isValidThemeKey('nope'));
