export const MAX_WORDS=50000;
export const MAX_FILE_BYTES=10*1024*1024;
export const WORD_PATTERN=/[\p{L}\p{M}\p{N}]+(?:['’][\p{L}\p{M}\p{N}]+)*/gu;
export function wordCount(text:string){let count=0;const re=new RegExp(WORD_PATTERN);while(re.exec(text))count++;return count;}
export function withinTextLimits(text:string){return wordCount(text)<=MAX_WORDS&&new TextEncoder().encode(text).byteLength<=MAX_FILE_BYTES;}
