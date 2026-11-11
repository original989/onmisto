import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseTelegramFeed,loadTelegramFeed} from '../worker/telegram.js';
const post=(id,text,datetime='2026-11-11T10:28:00+02:00')=>`<div data-post="starkon_24_7/${id}"><div class="tgme_widget_message_text js-message_text">${text}</div><a><time datetime="${datetime}"></time></a></div>`;
const page=body=>'<div class="tgme_channel_history">'+body+'</div>';
test('preserves literal text safely, nested markup, source URL and Kyiv time offset',()=>{
 const data=parseTelegramFeed(page(post('43465','Текст<br><b>каналу</b><div>Вкладений &amp; текст</div>&lt;img src=x&gt;<script>bad()</script>')),new Date('2026-11-11T11:00:00Z'));
 assert.equal(data.posts[0].text,'Текст\nканалуВкладений & текст\n<img src=x>');
 assert.equal(data.posts[0].publishedAt,'2026-11-11T08:28:00.000Z');
 assert.equal(data.posts[0].url,'https://t.me/starkon_24_7/43465');
 assert.equal(data.fetchedAt,'2026-11-11T11:00:00.000Z');
});
test('deduplicates and sorts newest first, skips media-only posts',()=>{
 const data=parseTelegramFeed(page(post('1','old')+post('2','new','2026-11-11T11:00:00Z')+post('1','edited')+'<div data-post="starkon_24_7/3"><time datetime="2026-11-11T11:00:00Z"></time></div>'));
 assert.deepEqual(data.posts.map(p=>p.id),['2','1']);assert.equal(data.posts[1].text,'edited');
});
test('refuses login pages, empty feeds, broken markup and unknown dates',()=>{
 for(const html of ['<h1>Login</h1>',page(''),page(post('1','x','invalid')),page('<div data-post="starkon_24_7/1"><div class="tgme_widget_message_text">broken')])assert.throws(()=>parseTelegramFeed(html));
});
test('bounds feed size and reports truncated posts',()=>{
 const data=parseTelegramFeed(page(Array.from({length:25},(_,i)=>post(String(i),'x'.repeat(12001))).join('')));
 assert.equal(data.posts.length,20);assert.equal(data.posts[0].text.length,12000);assert.equal(data.posts[0].truncated,true);
});
test('retries after failure, coalesces concurrent fetches and caches successful result',async()=>{
 const original=globalThis.fetch;let count=0;
 try{
 globalThis.fetch=async(url,options)=>{count++;assert.equal(url,'https://t.me/s/starkon_24_7');assert.equal(options.redirect,'manual');return new Response('Unavailable',{status:503})};
 await assert.rejects(loadTelegramFeed());
 globalThis.fetch=async()=>{count++;return new Response('',{status:302,headers:{Location:'https://t.me/starkon_24_7'}})};
 await assert.rejects(loadTelegramFeed());
 globalThis.fetch=async()=>{count++;return new Response(page(post('1','test')))};
 const [a,b]=await Promise.all([loadTelegramFeed(),loadTelegramFeed()]);assert.deepEqual(a,b);assert.equal(count,3);
 await loadTelegramFeed();assert.equal(count,3);
 }finally{globalThis.fetch=original}
});
