import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseDateText,dateCaption,rawDateText} from '../date-input.js';
import {fmtQuantity} from '../domain.js';

test('Запасной ввод даты: точный русский формат и реальный календарь',()=>{
 assert.equal(parseDateText('29.02.2024'),'2024-02-29');
 assert.equal(parseDateText('01.01.0001'),'0001-01-01');
 for(const text of ['29.02.2026','31.04.2026','00.01.2026','01.13.2026','1.01.2026','2026-01-01','01.01.0000',' 01.01.2026','01.01.2026 '])assert.equal(parseDateText(text),null,text);
 assert.equal(dateCaption('invalid:31.02.2026'),'неверная дата');
 assert.equal(dateCaption('2024-02-29'),'29.02.2024');
 assert.equal(rawDateText('invalid:31.02.2026'),'31.02.2026');
});
test('Количество: русская запятая без лишних нулей и разделения тысяч',()=>{
 for(const[n,text]of [[1,'0,01'],[200,'2'],[250,'2,5'],[275,'2,75'],[100000000,'1000000']])assert.equal(fmtQuantity(n),text);
});
