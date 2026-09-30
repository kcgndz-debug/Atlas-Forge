(() => {
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);

  function buildGrid(image,{maxDimension=900,darkThreshold=118}={}){
    const scale=Math.max(1,Math.ceil(Math.max(image.width,image.height)/maxDimension));
    const width=Math.ceil(image.width/scale),height=Math.ceil(image.height/scale),dark=new Uint8Array(width*height);
    for(let gy=0;gy<height;gy++)for(let gx=0;gx<width;gx++){
      const x=Math.min(image.width-1,gx*scale),y=Math.min(image.height-1,gy*scale),i=(y*image.width+x)*4;
      const a=image.data[i+3]/255,r=image.data[i],g=image.data[i+1],b=image.data[i+2];
      const luminance=.2126*r+.7152*g+.0722*b;
      const chroma=Math.max(r,g,b)-Math.min(r,g,b);
      dark[gy*width+gx]=a>.25&&(luminance<darkThreshold||(chroma>55&&luminance<205))?1:0;
    }
    return{width,height,dark,scale};
  }

  function traceLine(grid,start,step,{minimum=34,maxGap=2}={}){
    const points=[];let x=start.x,y=start.y,gap=0,darkCount=0;
    while(x>=0&&y>=0&&x<grid.width&&y<grid.height){
      if(grid.dark[y*grid.width+x]){points.push({x,y});darkCount++;gap=0}else if(points.length){gap++;if(gap>maxGap)break}
      x+=step.x;y+=step.y;
    }
    if(darkCount<minimum)return null;
    const first=points[0],last=points.at(-1),length=distance(first,last),density=darkCount/Math.max(1,length);
    if(length<minimum)return null;
    return{a:first,b:last,length,density:clamp(density,0,1),angle:(Math.atan2(step.y,step.x)*180/Math.PI+360)%180};
  }

  function candidatesForDirection(grid,step,options){
    const starts=[];
    if(step.x===1)for(let y=0;y<grid.height;y++)starts.push({x:0,y});
    if(step.y===1)for(let x=0;x<grid.width;x++)starts.push({x,y:0});
    if(step.x===-1)for(let y=0;y<grid.height;y++)starts.push({x:grid.width-1,y});
    if(step.x!==0&&step.y!==0){for(let y=1;y<grid.height;y++)starts.push({x:step.x>0?0:grid.width-1,y})}
    const results=[];
    for(const start of starts){
      let x=start.x,y=start.y;
      while(x>=0&&y>=0&&x<grid.width&&y<grid.height){
        const here=grid.dark[y*grid.width+x],px=x-step.x,py=y-step.y,previous=px>=0&&py>=0&&px<grid.width&&py<grid.height?grid.dark[py*grid.width+px]:0;
        if(here&&!previous){const result=traceLine(grid,{x,y},step,options);if(result)results.push(result)}
        x+=step.x;y+=step.y;
      }
    }
    return results;
  }

  function similar(a,b){
    const angle=Math.abs(a.angle-b.angle),angleDelta=Math.min(angle,180-angle);
    if(angleDelta>4)return false;
    const direct=distance(a.a,b.a)+distance(a.b,b.b),reverse=distance(a.a,b.b)+distance(a.b,b.a);
    return Math.min(direct,reverse)<Math.max(a.length,b.length)*.32;
  }

  function scanImageData(image,options={}){
    if(!image?.data||!image.width||!image.height)throw new Error('A rendered plan image is required');
    const grid=buildGrid(image,options),minimum=Math.max(24,Math.round((options.minimumPixels||110)/grid.scale));
    const raw=[[1,0],[0,1],[1,1],[-1,1]].flatMap(([x,y])=>candidatesForDirection(grid,{x,y},{minimum,maxGap:options.maxGap??2}));
    const ranked=raw.map(line=>{
      const lengthPixels=line.length*grid.scale,score=clamp(.48+.3*line.density+.22*Math.min(1,lengthPixels/700),0,0.99);
      return{start:{x:line.a.x*grid.scale,y:line.a.y*grid.scale},end:{x:line.b.x*grid.scale,y:line.b.y*grid.scale},lengthPixels,angle:line.angle,confidence:score,source:'pixel-line'};
    }).sort((a,b)=>b.confidence-a.confidence||b.lengthPixels-a.lengthPixels);
    const kept=[];
    for(const candidate of ranked){if(kept.some(existing=>similar({...existing,a:existing.start,b:existing.end,length:existing.lengthPixels},{...candidate,a:candidate.start,b:candidate.end,length:candidate.lengthPixels})))continue;kept.push(candidate);if(kept.length>Math.max(1,options.limit||24))break}
    return{engine:'athena-page-vision-v0.1',width:image.width,height:image.height,scale:grid.scale,candidates:kept,warning:'Candidate runs require human approval. Line detection does not establish scope or scale.'};
  }

  window.AtlasAthenaVision={version:'0.1.0',scanImageData};
})();
