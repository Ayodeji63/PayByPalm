import {useEffect} from 'react';
import {guidanceForPalm,terminalAudio} from './audio.js';
import type {AutoCaptureState,HandLandmark} from './useCamera.js';
export function useCaptureAudio(active:boolean,state:AutoCaptureState,hand:HandLandmark[],scopeId:string){
 useEffect(()=>{if(active&&scopeId)terminalAudio.event('ready',`ready:${scopeId}`);return()=>terminalAudio.cancelGuidance();},[active,scopeId]);
 useEffect(()=>{terminalAudio.guidance(active?guidanceForPalm(state,hand):null);return()=>{};},[active,state,hand]);
}
