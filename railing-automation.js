(() => {
  const registry=window.AtlasTradeRegistry;
  const EPS=1e-7;
  const average=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
  const roundTo=(v,inc=.0625)=>Math.round(v/inc)*inc;
  const gcd=(a,b)=>b?gcd(b,a%b):a;

  function formatInches(value){
    const rounded=roundTo(Number(value)||0,.0625);
    const whole=Math.floor(rounded+EPS);
    let num=Math.round((rounded-whole)*16);
    if(num===16)return String(whole+1);
    if(!num)return String(whole);
    const d=gcd(num,16);
    num/=d;
    const den=16/d;
    return whole?whole+' '+num+'/'+den:num+'/'+den;
  }

  function parseMeasure(text){
    const s=String(text).trim();
    if(!s)return 0;
    const parts=s.split(/\s+/);
    let value=Number(parts[0])||0;
    if(parts[1]&&parts[1].includes('/')){
      const [n,d]=parts[1].split('/').map(Number);
      if(d)value+=n/d;
    }else if(parts[0].includes('/')){
      const [n,d]=parts[0].split('/').map(Number);
      value=d?n/d:0;
    }
    return value;
  }

  function parseNotation(notation){
    const tokens=String(notation||'').match(/\/\/|\|\||•|\(|\)|\d+(?:\.\d+)?(?:\s+\d+\/\d+)?|\d+\/\d+/g)||[];
    const distances=[];
    let posts=0,splices=0,expansions=0,startHoop=false,endHoop=false;
    for(const token of tokens){
      if(token==='•')posts++;
      else if(token==='//')splices++;
      else if(token==='||')expansions++;
      else if(token==='(')startHoop=true;
      else if(token===')')endHoop=true;
      else distances.push(parseMeasure(token));
    }
    return{
      tokens,distances,posts,splices,expansions,startHoop,endHoop,
      totalInches:distances.reduce((s,v)=>s+v,0)
    };
  }

  function chooseBayCount(length,profile){
    const auto=profile.automation||{};
    const maxBay=Number(profile.maxBay)||Infinity;
    const sequence=auto.preferredBaySequence||[];
    const target=Number(auto.targetBay)||average(sequence)||(Number.isFinite(maxBay)?maxBay*.9:length);
    const min=Math.max(1,Math.ceil((length-EPS)/maxBay));
    let best=min,bestScore=Infinity;
    for(let n=min;n<=min+8;n++){
      const bay=length/n;
      if(bay>maxBay+EPS)continue;
      let score=Math.abs(bay-target);
      if(sequence.length&&n%sequence.length===0)score-=.05;
      score+=n*.002;
      if(score<bestScore){bestScore=score;best=n}
    }
    return best;
  }

  function distributeBays(length,count,profile){
    const auto=profile.automation||{};
    const inc=Number(auto.rounding)||.0625;
    const sequence=auto.preferredBaySequence||[];
    let values;
    if(sequence.length){
      values=Array.from({length:count},(_,i)=>Number(sequence[i%sequence.length])||0);
      const delta=length-values.reduce((s,v)=>s+v,0);
      values=values.map(v=>v+delta/count);
    }else{
      values=Array(count).fill(length/count);
    }
    values=values.map(v=>roundTo(v,inc));
    let diff=roundTo(length-values.reduce((s,v)=>s+v,0),inc);
    let guard=0;
    while(Math.abs(diff)>EPS&&guard++<1000){
      const step=Math.sign(diff)*Math.min(Math.abs(diff),inc);
      const index=(guard-1)%values.length;
      values[index]=roundTo(values[index]+step,inc);
      diff=roundTo(length-values.reduce((s,v)=>s+v,0),inc);
    }
    const maxBay=Number(profile.maxBay)||Infinity;
    if(values.some(v=>v>maxBay+EPS))throw new Error('A calculated bay exceeds the profile maximum.');
    return values;
  }

  function balancedSections(length,maxSpan,inc){
    const count=Math.max(1,Math.ceil((length-EPS)/maxSpan));
    let sections=Array(count).fill(roundTo(length/count,inc));
    let diff=roundTo(length-sections.reduce((s,v)=>s+v,0),inc);
    let i=0;
    while(Math.abs(diff)>EPS&&i<1000){
      const step=Math.sign(diff)*Math.min(Math.abs(diff),inc);
      const idx=i%sections.length;
      sections[idx]=roundTo(sections[idx]+step,inc);
      diff=roundTo(length-sections.reduce((s,v)=>s+v,0),inc);
      i++;
    }
    return sections;
  }

  function solve({totalInches,profileId,expansionStations=[]}){
    const profile=registry?.getLayoutProfile?.('railing',profileId);
    if(!profile)throw new Error('Railing layout profile not found.');
    const auto=profile.automation||{};
    if(!auto.enabled)throw new Error(auto.reason||'Automation is not enabled for this railing profile.');

    totalInches=roundTo(Number(totalInches)||0,auto.rounding||.0625);
    if(totalInches<=0)throw new Error('Run length must be greater than zero.');

    const startOffset=Number(auto.startOffset)||0;
    const endOffset=Number(auto.endOffset)||0;
    const contentStart=startOffset;
    const contentEnd=totalInches-endOffset;
    if(contentEnd<=contentStart)throw new Error('Run is too short for the required start/end conditions.');

    const warnings=[];
    const expansions=[...new Set((expansionStations||[])
      .map(v=>roundTo(Number(v)||0,auto.rounding||.0625))
      .filter(v=>{
        const ok=v>contentStart+EPS&&v<contentEnd-EPS;
        if(!ok&&v>0)warnings.push('Expansion at '+formatInches(v)+'″ falls inside an end condition and was not inserted.');
        return ok;
      })
      .sort((a,b)=>a-b))];

    const boundaries=[contentStart,...expansions,contentEnd];
    const sections=[];
    const maxSpan=Number(auto.maxSpliceSpan)||Infinity;
    const inc=Number(auto.rounding)||.0625;

    for(let region=0;region<boundaries.length-1;region++){
      const regionLength=boundaries[region+1]-boundaries[region];
      const sectionLengths=Number.isFinite(maxSpan)?balancedSections(regionLength,maxSpan,inc):[regionLength];
      sectionLengths.forEach((length,sectionIndex)=>{
        const count=chooseBayCount(length,profile);
        const bays=distributeBays(length,count,profile);
        const isFirstGlobal=region===0&&sectionIndex===0;
        const isLastInRegion=sectionIndex===sectionLengths.length-1;
        const isLastGlobal=region===boundaries.length-2&&isLastInRegion;
        const markerAfter=isLastGlobal?null:(isLastInRegion?'||':'//');
        sections.push({
          index:sections.length+1,
          region:region+1,
          interiorLength:roundTo(length,inc),
          bays,
          markerAfter,
          overallLength:roundTo(length+(isFirstGlobal?startOffset:0)+(isLastGlobal?endOffset:0),inc),
          startHoop:isFirstGlobal&&!!auto.wrapStart,
          endHoop:isLastGlobal&&!!auto.wrapEnd
        });
      });
    }

    let notation=auto.wrapStart?'(':'';
    if(startOffset){
      notation+=formatInches(startOffset);
      if(sections[0]?.bays?.length)notation+='•';
    }
    sections.forEach((section,si)=>{
      section.bays.forEach((bay,bi)=>{
        notation+=formatInches(bay);
        if(bi<section.bays.length-1)notation+='•';
      });
      if(section.markerAfter)notation+=section.markerAfter;
      else if(endOffset)notation+='•'+formatInches(endOffset);
    });
    if(auto.wrapEnd)notation+=')';

    const parsed=parseNotation(notation);
    const maxBay=Math.max(...sections.flatMap(s=>s.bays));
    const minBay=Math.min(...sections.flatMap(s=>s.bays));
    const valid=Math.abs(parsed.totalInches-totalInches)<=inc+EPS &&
      (!profile.maxBay||maxBay<=profile.maxBay+EPS) &&
      sections.every(s=>!Number.isFinite(maxSpan)||s.interiorLength<=maxSpan+EPS);

    if(!valid)warnings.push('Layout did not pass one or more profile checks.');

    return{
      schemaVersion:'1.0',
      profileId:profile.id,
      profileName:profile.name,
      totalInches,
      notation,
      parsed,
      sections,
      posts:parsed.posts,
      splices:parsed.splices,
      expansions:parsed.expansions,
      expansionStations:expansions,
      maxBay:roundTo(maxBay,inc),
      minBay:roundTo(minBay,inc),
      valid,
      warnings,
      notationLegend:{'(':'start hoop',')':'end hoop','•':'post','//':'splice','||':'expansion joint'}
    };
  }

  function selfTest(){
    try{
      const result=solve({totalInches:306,profileId:'actual-two-rail'});
      return{
        pass:result.notation==='(18•67•68//67•68•18)'&&result.posts===4&&result.splices===1&&result.expansions===0,
        expected:'(18•67•68//67•68•18)',
        actual:result.notation
      };
    }catch(error){
      return{pass:false,error:error.message};
    }
  }

  window.AtlasRailingAutomation={solve,parseNotation,formatInches,selfTest};
})();