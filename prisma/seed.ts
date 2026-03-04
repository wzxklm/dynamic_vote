import { PrismaClient } from "@prisma/client";
import { presetOptions } from "../src/data/presets";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding preset options...");

  for (const option of presetOptions) {
    await prisma.dynamicOption.upsert({
      where: {
        layer_value_parentKey: {
          layer: option.layer,
          value: option.value,
          parentKey: option.parentKey,
        },
      },
      update: {},
      create: {
        layer: option.layer,
        value: option.value,
        parentKey: option.parentKey,
        isPreset: true,
        promoted: true,
      },
    });
  }

  console.log(`Seeded ${presetOptions.length} preset options.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
