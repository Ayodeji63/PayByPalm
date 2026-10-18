/* Pi hand-placement inference stays off the UI thread. No images leave this worker. */
let detector=null;
self.onmessage=async({data:m})=>{
 if(m?.type==='init'){
  try{
   importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js');
   const api=self.Vision||self.vision;
   const files=await api.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm');
   detector=await api.HandLandmarker.createFromOptions(files,{
    baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',delegate:'CPU'},
    runningMode:'VIDEO',numHands:1,minHandDetectionConfidence:0.65,minHandPresenceConfidence:0.65,minTrackingConfidence:0.6,
   });
   self.postMessage({type:'ready'});
  }catch{self.postMessage({type:'error',id:m.id});}
 }else if(m?.type==='frame'){
  try{
   if(!detector)throw Error('Detector unavailable');
   const result=detector.detectForVideo(m.bitmap,m.timestamp);
   self.postMessage({type:'result',id:m.id,landmarks:result.landmarks});
  }catch{self.postMessage({type:'error',id:m.id});}
  finally{m.bitmap?.close();}
 }
};
