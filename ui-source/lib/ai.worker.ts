/// <reference lib="webworker" />
import {assessAI} from '../backend/ai';
self.onmessage=async(event:MessageEvent<{text:string}>)=>{const result=await assessAI(event.data.text,(message,result)=>self.postMessage({type:'progress',message,result}));self.postMessage({type:'complete',result});};
