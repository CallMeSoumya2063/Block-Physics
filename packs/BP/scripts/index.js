import { world, system, BlockPermutation, ItemStack, Player } from "@minecraft/server";

// utils.ts
function isInList(list, str) {
  if (list.includes(str)) return true;
  return list.filter((v) => v.startsWith("*")).findIndex((v) => str.endsWith(v.slice(1))) >= 0;
}

function getGamerules() {
  return { dotiledrops: world.gameRules.doTileDrops };
}

function sendMessage(plr, msg) {
  plr.sendMessage(msg);
}

function createEntityBlock(block, dimension, location) {
  const blockEnt = dimension.spawnEntity("bp:entity_block", location);
  blockEnt.triggerEvent("stackable");
  blockEnt.triggerEvent("physics");
  blockEnt.addTag(`$blockId:${block}`);
  let blockId = block;
  
  if (blockId.startsWith("minecraft:lit_")) {
    blockId = blockId.replace("minecraft:lit_", "");
  } else if (blockId.startsWith("minecraft:unlit_")) {
    blockId = blockId.replace("minecraft:unlit_", "");
  }
    
  system.runTimeout(() => {
    blockEnt.runCommandAsync(
      `replaceitem entity @s slot.weapon.mainhand 0 ${blockId}`
    ).catch(() => {
    });
  }, 1);
  
  return blockEnt;
}

var VectorMath = {
  subtract(v1, v2) {
    return { x: v1.x - v2.x, y: v1.y - v2.y, z: v1.z - v2.z };
  },
  add(v1, v2) {
    return { x: v1.x + v2.x, y: v1.y + v2.y, z: v1.z + v2.z };
  },
  multiply(v1, val) {
    if (typeof val === "number") return { x: v1.x * val, y: v1.y * val, z: v1.z * val };
    return { x: v1.x * val.x, y: v1.y * val.y, z: v1.z * val.z };
  },
  divide(v1, val) {
    return { x: v1.x / val, y: v1.y / val, z: v1.z / val };
  },
  distance(v1, v2) {
    return Math.hypot(v1.x - v2.x, v1.y - v2.y, v1.z - v2.z);
  },
  magnitude(v) {
    return Math.hypot(v.x, v.y, v.z);
  }
};

// explosion-config.js
var explosionConfig = {
  enabled: true,
  simpleMath: true,
  placeWhenHitGround: true,
  dropWhenUnplaceable: false,
  collideWithEntities: false,
  despawnTimer: true,
  rotateWithVelocity: true,
  ignoreBlocks: [
    "tnt", "*_door", "bed", "frame", "glowing_frame", "*_double_slab", 
    "*_double_cut_copper_slab", "stonecutter", "tallgras", "red_flower", 
    "yellow_flower", "brown_mushroom", "red_mushroom", "reeds", "carrots", 
    "wheat", "potatoes", "beetroot", "pumpkin_stem", "melon_stem", 
    "nether_wart", "*_button", "*_pressure_plate", "fire"
  ],
  replaceBlocks: ["lava", "water", "air", "fire"],
  additionalVerticalVelocity: 1.5,
  verticalVelocityModifier: 1,
  horizontalVelocityModifier: 1.6,
  minBlocksToSpawnPerTick: 15
};

// explosions.ts
var {
  additionalVerticalVelocity,
  collideWithEntities,
  despawnTimer,
  dropWhenUnplaceable,
  enabled,
  horizontalVelocityModifier,
  ignoreBlocks,
  placeWhenHitGround,
  replaceBlocks,
  rotateWithVelocity,
  simpleMath,
  verticalVelocityModifier,
  minBlocksToSpawnPerTick
} = explosionConfig;

ignoreBlocks = ignoreBlocks.map((v) => v.replace("minecraft:", ""));
replaceBlocks = replaceBlocks.map((v) => v.replace("minecraft:", ""));
var blockMap = new Map();
var tick = 0;

system.runInterval(() => {
  tick++;
});

if (enabled) {
  world.beforeEvents.explosion.subscribe((evd) => {
    if (!evd.source) return;
    const orgLoc = evd.source.location;
    const origin = { x: orgLoc.x, y: orgLoc.y + 0.5, z: orgLoc.z };
    const impactedBlocks = evd.getImpactedBlocks();
    const blocks2 = impactedBlocks.filter((block) => !isInList(ignoreBlocks, block.typeId.replace("minecraft:", "")));
    
    const blockDist = new Map();
    const blockId = new Map();
    const blockPerms = new Map();
    
    for (const block of blocks2) {
      if (!simpleMath) {
        blockDist.set(
          block,
          Math.hypot(
            origin.x - block.x,
            origin.y - (block.y - 0.5),
            origin.z - block.z
          )
        );
      }
      blockId.set(block, block.typeId);
      blockPerms.set(block, block.permutation);
    }
    
    const range = blockDist.size > 0 ? Math.max(...Array.from(blockDist.values())) : 0;
    
    system.run(async () => {
      let currentTick = tick;
      let blocksInTick = 0;
      for (const block of blocks2) {
        const pos = { x: block.x + 0.5, y: block.y - 0.5, z: block.z + 0.5 };
        let vel = VectorMath.subtract(pos, origin);
        const dist = VectorMath.magnitude(vel);
        
        if (dist > 0) vel = VectorMath.divide(vel, dist);
        if (!simpleMath && range > 0) {
          const distMod = (range - Math.pow(dist, 1.5) + Math.pow(dist, 1.1)) / range;
          vel = VectorMath.multiply(vel, distMod * 2);
        }
        
        vel.y += additionalVerticalVelocity;
        vel = VectorMath.multiply(
          vel,
          {
            x: horizontalVelocityModifier,
            y: verticalVelocityModifier,
            z: horizontalVelocityModifier
          }
        );
        
        const id = blockId.get(block) ?? "minecraft:air";
        const eBlock = createEntityBlock(
          id,
          block.dimension,
          { x: block.x + 0.5, y: block.y + 0.5, z: block.z + 0.5 }
        );
        eBlock.addTag("$entityBlockFromTNT");
        
        if (collideWithEntities) eBlock.triggerEvent("collision");
        if (despawnTimer) eBlock.triggerEvent("despawn_timer");
        
        if (placeWhenHitGround) {
            const savedPerm = blockPerms.get(block);
            if (savedPerm) {
                blockMap.set(eBlock.id, savedPerm); 
            }
        }
        
        if (rotateWithVelocity) eBlock.triggerEvent("rotate");
        
        eBlock.applyImpulse(vel);
        
        try {
            block.setPermutation(BlockPermutation.resolve("minecraft:air"));
        } catch {}
        
        if (currentTick != tick) {
          currentTick = tick;
          blocksInTick = 0;
        }
        blocksInTick++;
        
        if (blocksInTick > minBlocksToSpawnPerTick) {
          await new Promise((resolve) => system.run(resolve));
        }
      }
    });
  });
  
  if (placeWhenHitGround) {
    world.afterEvents.dataDrivenEntityTrigger.subscribe((evd) => {
      const eventName = evd.eventId || evd.id;
      if (eventName !== "hit_ground") return;
      
      const entity = evd.entity;
      if (!entity || !entity.isValid() || !entity.hasTag("$entityBlockFromTNT")) return;
      
      const perm = blockMap.get(entity.id);
      blockMap.delete(entity.id); 
      if (!perm) return;
      
      const loc = entity.location;
      const targetX = Math.floor(loc.x);
      let targetY = Math.round(loc.y); 
      const targetZ = Math.floor(loc.z);
      
      try {
        let block = entity.dimension.getBlock({ x: targetX, y: targetY, z: targetZ });
        if (!block) return;
        
        let canPlace = isInList(replaceBlocks, block.typeId.replace("minecraft:", ""));
        
        if (!canPlace) {
            const blockAbove = entity.dimension.getBlock({ x: targetX, y: targetY + 1, z: targetZ });
            if (blockAbove && isInList(replaceBlocks, blockAbove.typeId.replace("minecraft:", ""))) {
                block = blockAbove;
                canPlace = true;
            }
        }
        
        if (canPlace) {
          block.setPermutation(perm);
        } else if (dropWhenUnplaceable) {
          if (getGamerules().dotiledrops) {
            const item = new ItemStack(perm.type.id, 1);
            entity.dimension.spawnItem(item, loc);
          }
        }
        entity.triggerEvent("despawn");
      } catch (e) {
      }
    });
  }
} 

// block_launcher.ts
var {
  collideWithEntities: collideWithEntities2,
  ignoreBlocks: ignoreBlocks2,
  rotateWithVelocity: rotateWithVelocity2
} = explosionConfig;

ignoreBlocks2 = ignoreBlocks2.map((v) => v.replace("minecraft:", ""));
var blocks = new Map();

world.beforeEvents.itemUseOn.subscribe((evd) => {
  const item = evd.itemStack;
  if (item?.typeId !== "minecraft:stick" || item?.nameTag !== "Block Launcher") return;
  const plr = evd.source;
  if (!(plr instanceof Player)) return;
  
  const block = evd.block;
  const currBlock = blocks.get(plr.id);
  if (currBlock?.typeId === block.typeId) return;
  
  if (isInList(ignoreBlocks2, block.typeId.replace("minecraft:", ""))) {
    sendMessage(
      plr,
      `[Block Launcher] Block cannot be set to ${block.typeId}, this block is in the ignore list`
    );
    return;
  }
  
  blocks.set(plr.id, { 
    typeId: block.typeId, 
    dimension: block.dimension, 
    permutation: block.permutation 
  });
  sendMessage(plr, `[Block Launcher] Block set to ${block.typeId}`);
});

world.beforeEvents.itemUse.subscribe((evd) => {
  const item = evd.itemStack;
  if (item?.typeId !== "minecraft:stick" || item?.nameTag !== "Block Launcher") return;
  const plr = evd.source;
  if (!(plr instanceof Player)) return;
  
  const blockData = blocks.get(plr.id); 
  if (!blockData) {
    sendMessage(
      plr,
      "[Block Launcher] No block picked, pick a block to fire by clicking one"
    );
    return;
  }
  
  system.run(() => {
    const eBlock = createEntityBlock(blockData.typeId, blockData.dimension, plr.getHeadLocation());
    if (collideWithEntities2) eBlock.triggerEvent("collision");
    eBlock.triggerEvent("despawn_timer");
    if (rotateWithVelocity2) eBlock.triggerEvent("rotate");
    
    eBlock.addTag("$entityBlockFromTNT");
    if (blockData.permutation) {
        blockMap.set(eBlock.id, blockData.permutation);
    }
    
    const velocity = VectorMath.multiply(plr.getViewDirection(), 2);
    eBlock.applyImpulse(velocity);
  });
});
