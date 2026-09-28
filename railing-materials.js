(() => {
  const EPS=1e-7;
  const automation=window.AtlasRailingAutomation;
  const round=(v,inc=.0625)=>Math.round((Number(v)||0)/inc)*inc;
  const fmt=v=>automation?.formatInches?.(v)??String(round(v));

  function normalizeProfile(profile={}){
    return{
      id:profile.id||'custom',
      name:profile.name||'Custom railing',
      rails:Math.max(1,Math.floor(Number(profile.rails)||1)),
      stock:Math.max(.0625,Number(profile.stock)||240),
      kerf:Math.max(0,Number(profile.kerf)||0),
      overlap:Math.max(0,Number(profile.overlap)||0),
      gap:Math.max(0,Number(profile.gap)||0),
      reusableDropMin:Math.max(0,Number(profile.reusableDropMin)||0),
      layoutProfile:profile.layoutProfile||profile.id||'custom'
    };
  }

  function buildRequirements(layout,profile){
    if(!layout?.sections?.length)throw new Error('Generate a railing layout before building the cut list.');
    profile=normalizeProfile(profile);
    const cuts=[];
    for(const section of layout.sections){
      const length=round(Number(section.overallLength)||0);
      if(length<=0)continue;
      for(let rail=1;rail<=profile.rails;rail++){
        cuts.push({
          id:`S${section.index}-R${rail}`,
          section:section.index,
          rail,
          length,
          markerAfter:section.markerAfter||null,
          startHoop:!!section.startHoop,
          endHoop:!!section.endHoop
        });
      }
    }
    return{
      cuts,
      accessories:{
        posts:Number(layout.posts)||0,
        spliceSleeves:(Number(layout.splices)||0)*profile.rails,
        expansionSleeves:(Number(layout.expansions)||0)*profile.rails,
        spliceCount:Number(layout.splices)||0,
        expansionCount:Number(layout.expansions)||0
      }
    };
  }

  function bestFit(cuts,profile){
    const stock=profile.stock,kerf=profile.kerf;
    const oversize=cuts.filter(c=>c.length>stock+EPS).map(c=>({...c,overBy:round(c.length-stock)}));
    const eligible=cuts.filter(c=>c.length<=stock+EPS).sort((a,b)=>b.length-a.length||a.id.localeCompare(b.id));
    const sticks=[];
    for(const cut of eligible){
      let best=-1,bestRemaining=Infinity;
      for(let i=0;i<sticks.length;i++){
        const stick=sticks[i];
        const extra=cut.length+(stick.cuts.length?kerf:0);
        if(stick.used+extra<=stock+EPS){
          const remaining=stock-(stick.used+extra);
          if(remaining<bestRemaining-EPS){best=i;bestRemaining=remaining}
        }
      }
      if(best<0){
        sticks.push({id:sticks.length+1,stockLength:stock,used:cut.length,cuts:[cut]});
      }else{
        const stick=sticks[best];
        stick.used=round(stick.used+(stick.cuts.length?kerf:0)+cut.length);
        stick.cuts.push(cut);
      }
    }
    for(const stick of sticks){
      stick.remaining=round(stock-stick.used);
      stick.reusable=profile.reusableDropMin>0?stick.remaining+EPS>=profile.reusableDropMin:null;
    }
    return{sticks,oversize};
  }

  function optimize({layout,profile}){
    profile=normalizeProfile(profile);
    const req=buildRequirements(layout,profile);
    const packed=bestFit(req.cuts,profile);
    const purchasedLength=round(packed.sticks.length*profile.stock);
    const requiredLength=round(req.cuts.filter(c=>c.length<=profile.stock+EPS).reduce((s,c)=>s+c.length,0));
    const kerfUsed=round(packed.sticks.reduce((s,stick)=>s+Math.max(0,stick.cuts.length-1)*profile.kerf,0));
    const remainingLength=round(packed.sticks.reduce((s,stick)=>s+stick.remaining,0));
    const allRequiredLength=round(req.cuts.reduce((s,c)=>s+c.length,0));
    const wastePercent=purchasedLength>0?remainingLength/purchasedLength*100:0;
    const warnings=[];
    if(packed.oversize.length)warnings.push(`${packed.oversize.length} required rail piece${packed.oversize.length===1?' is':'s are'} longer than the selected ${fmt(profile.stock)}″ stock. Forge did not invent an extra splice.`);
    if(profile.kerf===0)warnings.push('Saw kerf is set to 0″. Set a kerf in the fabrication profile if the shop needs it included in nesting.');
    return{
      schemaVersion:'1.0',
      profile,
      layoutProfileId:layout.profileId,
      notation:layout.notation,
      requiredCuts:req.cuts,
      accessories:req.accessories,
      sticks:packed.sticks,
      oversize:packed.oversize,
      summary:{
        railMembers:req.cuts.length,
        stockSticks:packed.sticks.length,
        requiredLength:allRequiredLength,
        packedRequiredLength:requiredLength,
        purchasedLength,
        kerfUsed,
        remainingLength,
        wastePercent:Math.round(wastePercent*10)/10
      },
      warnings
    };
  }

  function optimizeMany(entries=[]){
    const groups=new Map();
    const skipped=[];
    for(const entry of entries){
      if(!entry?.layout||!entry?.profile){skipped.push(entry?.name||'Unnamed run');continue}
      const profile=normalizeProfile(entry.profile);
      const key=[profile.id,profile.stock,profile.kerf,profile.rails].join('|');
      if(!groups.has(key))groups.set(key,{profile,cuts:[],accessories:{posts:0,spliceSleeves:0,expansionSleeves:0,spliceCount:0,expansionCount:0},runs:[]});
      const group=groups.get(key);
      const req=buildRequirements(entry.layout,profile);
      group.runs.push(entry.name||entry.layout.notation||'Run');
      for(const cut of req.cuts)group.cuts.push({...cut,run:entry.name||'Run',id:`${entry.name||'Run'} · ${cut.id}`});
      for(const k of Object.keys(group.accessories))group.accessories[k]+=req.accessories[k]||0;
    }
    const results=[];
    for(const group of groups.values()){
      const packed=bestFit(group.cuts,group.profile);
      const purchasedLength=round(packed.sticks.length*group.profile.stock);
      const remainingLength=round(packed.sticks.reduce((s,stick)=>s+stick.remaining,0));
      results.push({
        profile:group.profile,
        runs:group.runs,
        accessories:group.accessories,
        requiredCuts:group.cuts,
        sticks:packed.sticks,
        oversize:packed.oversize,
        summary:{
          railMembers:group.cuts.length,
          stockSticks:packed.sticks.length,
          purchasedLength,
          remainingLength,
          wastePercent:purchasedLength?Math.round(remainingLength/purchasedLength*1000)/10:0
        }
      });
    }
    return{schemaVersion:'1.0',groups:results,skipped};
  }

  function toCsv(plan){
    const rows=[['Stock Stick','Stock Length (in)','Cut ID','Run','Section','Rail','Cut Length (in)','Remaining Drop (in)']];
    for(const stick of plan.sticks||[]){
      stick.cuts.forEach((cut,i)=>rows.push([
        stick.id,stick.stockLength,cut.id,cut.run||'',cut.section,cut.rail,cut.length,i===stick.cuts.length-1?stick.remaining:''
      ]));
    }
    for(const cut of plan.oversize||[])rows.push(['OVERSIZE',plan.profile?.stock||'',cut.id,cut.run||'',cut.section,cut.rail,cut.length,'']);
    return rows;
  }

  function selfTest(){
    try{
      const layout={
        profileId:'actual-two-rail',
        notation:'(18•67•68//67•68•18)',
        posts:4,splices:1,expansions:0,
        sections:[
          {index:1,overallLength:153,markerAfter:'//',startHoop:true,endHoop:false},
          {index:2,overallLength:153,markerAfter:null,startHoop:false,endHoop:true}
        ]
      };
      const plan=optimize({layout,profile:{id:'870',name:'870',rails:2,stock:240,kerf:0,overlap:6,gap:.5}});
      return{
        pass:plan.requiredCuts.length===4&&plan.sticks.length===4&&plan.sticks.every(s=>Math.abs(s.remaining-87)<EPS)&&plan.accessories.spliceSleeves===2,
        railMembers:plan.requiredCuts.length,
        stockSticks:plan.sticks.length,
        drops:plan.sticks.map(s=>s.remaining)
      };
    }catch(error){return{pass:false,error:error.message}}
  }

  window.AtlasRailingMaterials={optimize,optimizeMany,buildRequirements,toCsv,selfTest};
})();