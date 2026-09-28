(() => {
  const clone=value=>JSON.parse(JSON.stringify(value));

  const modules={
    railing:{
      id:'railing',
      name:'Railing & Fence',
      version:'1.0.0',
      enabled:true,
      engine:'linear-fabrication-v1',
      groups:['General','862 Type 1 Picket','870 Aluminum Two-Rail','880 Steel Two-Rail','822 Bullet Rail','550-002 Type B Fence','550-003 Gate','Removal'],
      calculators:['rail-layout'],
      athena:{
        role:'Railing and fence takeoff, shop-layout, fabrication, and material-planning specialist.',
        rules:[
          'Use plan station-to-station dimensions exactly unless the user explicitly directs otherwise.',
          'Do not subtract masonry pilasters unless specifically requested.',
          'Inspect each side of a bridge, boardwalk, or run independently; never mirror or assume opposite-side breaks.',
          'Do not run straight rail through stair, crossover, access, or other openings; stop and wrap/turn as shown.',
          'Revision clouds and revision notes override the original base layout.',
          'Apply the selected rail profile rules before optimizing bay sizes or stock usage.',
          'A valid layout must satisfy both the individual bay maximum and the allowed multi-bay shop-section pattern/overall length.',
          'Expansion joints split solid rail pieces and must be carried through the fabrication/cut schedule.',
          'Keep at least two ground-touching posts in each applicable double-rail shop section.',
          'Treat layout optimization and stock-cut optimization as separate checks: geometry must be legal before material nesting is optimized.'
        ]
      },
      layoutProfiles:{
        '862':{
          id:'862',aliases:['515-062'],name:'862 / 515-062 Aluminum Picket',
          maxBay:68,picketSpacing:6,
          sections:{
            start:{pattern:'17•68•67//',overall:152},
            middle:{pattern:'//68•67//',overall:135},
            alternate:{pattern:'//68•67•67//',overall:202}
          }
        },
        '515-052':{
          id:'515-052',aliases:[],name:'515-052 Steel Picket',
          maxBay:67,
          sections:{
            start:{pattern:'17•67•66//',overall:150},
            middle:{pattern:'//67•66//',overall:133},
            alternate:{pattern:'//67•66•66//',overall:199}
          }
        },
        '870':{
          id:'870',aliases:['515-070'],name:'870 / 515-070 Aluminum Pipe Rail',
          maxBay:72,startHoop:18,endHoop:18,minGroundPostsPerSection:2,
          sections:{
            start:{pattern:'18•65•65•65•45//',overall:258},
            middle:{pattern:'//18•60•60•60•42//',overall:240},
            end:{pattern:'//18•X•18',overall:null}
          }
        },
        '880':{
          id:'880',aliases:['515-080'],name:'880 / 515-080 Steel Pipe Rail',
          maxBay:72,startHoop:18,endHoop:18,minGroundPostsPerSection:2,
          sections:{
            start:{pattern:'18•69•69•69•45//',overall:270},
            middle:{pattern:'//18•63•63•63•45//',overall:252},
            end:{pattern:'//18•X•18',overall:null}
          }
        },
        'actual-two-rail':{
          id:'actual-two-rail',aliases:[],name:'Actual Two-Rail Field Layout',
          maxBay:72,startHoop:18,endHoop:18,minGroundPostsPerSection:2,
          preferredPair:[68,67],
          sections:{preferred:{pattern:'68•67',overall:135}}
        },
        '822':{
          id:'822',aliases:[],name:'822 Bullet Rail',
          maxBay:null,
          sections:{}
        }
      },
      materialProfiles:[
        {id:'870',name:'870 Aluminum Two-Rail',rails:2,stock:240,post:72,overlap:6,gap:.5,bendPost:21,radius:6,layoutProfile:'870'},
        {id:'880',name:'880 Steel Two-Rail',rails:2,stock:240,post:72,overlap:6,gap:.5,bendPost:21,radius:6,layoutProfile:'880'},
        {id:'822',name:'822 Bullet Rail',rails:2,stock:240,post:72,overlap:6,gap:.5,bendPost:21,radius:6,layoutProfile:'822'}
      ]
    },
    general:{
      id:'general',
      name:'General Takeoff',
      version:'1.0.0',
      enabled:true,
      engine:'generic-takeoff-v1',
      groups:['General','Existing conditions','Demolition','Concrete','Electrical','Mechanical','Other'],
      calculators:[],
      athena:{
        role:'General construction takeoff assistant.',
        rules:['Use calibrated plan geometry and preserve user-defined takeoff groups.']
      },
      layoutProfiles:{},
      materialProfiles:[]
    }
  };

  const templates={
    pipe:{
      id:'pipe',
      name:'Pipe / Piping',
      enabled:false,
      engine:'linear-fabrication-v1',
      suggestedRuleSlots:['pipeSize','material','stockLength','fittingTypes','minimumStraight','bendRadius','jointType','hangerSpacing','wasteAllowance']
    },
    wire:{
      id:'wire',
      name:'Wire / Cable',
      enabled:false,
      engine:'linear-routing-v1',
      suggestedRuleSlots:['wireType','gauge','reelLength','routingRules','pullBoxSpacing','slackAllowance','terminationAllowance','conduitFill','wasteAllowance']
    }
  };

  function get(id){return modules[id]?clone(modules[id]):null}
  function list(){return Object.values(modules).filter(m=>m.enabled).map(clone)}
  function resolveLayoutProfile(moduleId,profileId){
    const m=modules[moduleId]; if(!m)return null;
    if(m.layoutProfiles[profileId])return clone(m.layoutProfiles[profileId]);
    const found=Object.values(m.layoutProfiles).find(p=>(p.aliases||[]).includes(profileId));
    return found?clone(found):null;
  }
  function getMaterialProfiles(moduleId){return clone(modules[moduleId]?.materialProfiles||[])}
  function getAthenaContext(moduleId){
    const m=modules[moduleId]; if(!m)return null;
    return clone({
      schemaVersion:'1.0',
      module:{id:m.id,name:m.name,version:m.version,engine:m.engine},
      role:m.athena?.role||'',
      rules:m.athena?.rules||[],
      layoutProfiles:m.layoutProfiles||{}
    });
  }

  window.AtlasTradeRegistry={
    schemaVersion:'1.0',
    get,
    list,
    getLayoutProfile:resolveLayoutProfile,
    getMaterialProfiles,
    getAthenaContext,
    templates:clone(templates)
  };
})();