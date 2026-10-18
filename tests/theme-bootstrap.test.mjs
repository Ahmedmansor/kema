import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
test('saved theme applies synchronously before styles and before any body content',async()=>{
 const script=await readFile(new URL('../public/theme-init.js',import.meta.url),'utf8');
 for(const [saved,system,expected]of [['dark',false,'dark'],['light',true,'light'],[null,true,'dark'],[null,false,'light']]){let applied;runInNewContext(script,{localStorage:{getItem:()=>saved},matchMedia:()=>({matches:system}),document:{documentElement:{setAttribute:(key,value)=>applied=value}}});assert.equal(applied,expected);}
 let applied;runInNewContext(script,{localStorage:{getItem(){throw Error('Blocked storage');}},matchMedia:()=>({matches:true}),document:{documentElement:{setAttribute:(key,value)=>applied=value}}});assert.equal(applied,'dark');
 const html=await readFile(new URL('../public/index.html',import.meta.url),'utf8'),bootstrap=html.indexOf('<script src="./theme-init.js"></script>');assert.ok(bootstrap>0&&bootstrap<html.indexOf('href="./styles.css"'));assert.ok(html.indexOf('href="./themes.css"')<html.indexOf('</head>'));assert.doesNotMatch(html.match(/<script[^>]*theme-init[^>]*>/)[0],/type="module"|defer|async/);
});
