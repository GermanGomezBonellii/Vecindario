const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=['config','copy','clue-copy','rng','map','clues','solver','generator','game'].map(n=>fs.readFileSync(path.join(__dirname,'js',n+'.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/\bexport\s+/g,'')).join('\n');
const storage=new Map();
class UIStub {bind(){} hideEnd(){} renderMap(){} setPrompt(){} refresh(){} showShop(show){this.shopVisible=show;} hideStartModal(){}}
const context={console,UI:UIStub,AudioManager:class {},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
const api=vm.runInNewContext(source+'\n({Game,CONFIG,t,setLanguage})',context);
const g=new api.Game({seed:'shop-test'});
assert.equal(g.score,3000);assert.equal(g.lives,3);assert.equal(g.selectTheme('sunset'),false);
g.openShop();assert.equal(g.shopOpen,false);
g.finished=true;g.lastOutcomeWon=true;g.lives=2;g.openShop();assert.equal(g.shopOpen,true);
g.score=2999;assert.equal(g.buyLife(),false);assert.equal(g.lives,2);
g.score=3000;assert.equal(g.buyLife(),true);assert.equal(g.score,0);assert.equal(g.lives,3);
g.score=5000;assert.equal(g.buyLife(),false);assert.equal(g.score,5000);
g.score=9999;assert.equal(g.buySunset(),false);assert.equal(g.sunsetUnlocked,false);
g.score=10000;assert.equal(g.buySunset(),true);assert.equal(g.score,0);assert.equal(g.theme,'sunset');
assert.equal(storage.get('vecindario.unlock.sunset'),'true');assert.equal(g.buySunset(),false);
const semantics=JSON.stringify(g.level);
for(const theme of ['day','night','sunset']) {assert.equal(g.selectTheme(theme),true);assert.equal(g.theme,theme);assert.equal(g.score,0);}
assert.equal(JSON.stringify(g.level),semantics);
g.updateUrl=()=>{};g.lives=2;g.nextLevel();assert.equal(g.levelNumber,2);assert.equal(g.score,3350);assert.equal(g.lives,2);assert.equal(g.theme,'sunset');assert.equal(g.shopOpen,false);
g.nextLevel();assert.equal(g.score,3350);assert.equal(g.levelNumber,2);
g.retry();assert.equal(g.score,3350);assert.equal(g.lives,2);
g.finished=true;g.lastOutcomeWon=true;g.openShop();g.nextLevel();assert.equal(g.score,7050);
const reopened=new api.Game({seed:'shop-reopen'});assert.equal(reopened.sunsetUnlocked,true);assert.equal(reopened.theme,'sunset');
for(const lang of ['es','en']) {api.setLanguage(lang);for(const key of ['shop.title','shop.saved','shop.continue','lifePurchase.poor']) assert(api.t(key).length>1);}
console.log('PASS: prices, insufficient funds, caps, one-time unlock, theme selection, persistence, carried points/lives, guarded progression, ES/EN.');
