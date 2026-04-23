
const { Client } = require("@notionhq/client");
const fs = require("fs");
const csv = require("csv-parse/sync");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const databaseId = process.env.NOTION_DATA_SOURCE_ID;

async function run() {
    const db = await notion.databases.retrieve({ database_id: databaseId });
    console.log("--- NOTION PROPERTIES ---");
    const properties = db.properties;
    Object.keys(properties).forEach(name => {
        console.log(`${name}: ${properties[name].type}`);
    });

    const fileContent = fs.readFileSync("new-plants.csv", "utf-8");
    const records = csv.parse(fileContent, { columns: true, skip_empty_lines: true });
    const csvColumns = Object.keys(records[0]);
    console.log("\n--- MATCHING COLUMNS ---");
    csvColumns.forEach(col => {
        if (properties[col]) {
            console.log(`${col}: Match found`);
        }
    });

    const existingSlugs = new Set();
    let hasMore = true;
    let startCursor = undefined;
    while (hasMore) {
        const response = await notion.databases.query({
            database_id: databaseId,
            start_cursor: startCursor,
        });
        response.results.forEach(page => {
            const slugProp = page.properties.slug;
            if (slugProp && slugProp.rich_text && slugProp.rich_text.length > 0) {
                existingSlugs.add(slugProp.rich_text[0].plain_text);
            }
        });
        hasMore = response.has_more;
        startCursor = response.next_cursor;
    }

    const csvSlugs = records.map(r => r.slug);
    const commonSlugs = csvSlugs.filter(s => existingSlugs.has(s));
    console.log("\n--- EXISTING SLUGS IN NOTION ---");
    commonSlugs.forEach(s => console.log(s));

    const safeToCreate = csvSlugs.filter(s => !existingSlugs.has(s)).length;
    console.log("\n--- COUNT SAFE TO CREATE ---");
    console.log(safeToCreate);
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});

