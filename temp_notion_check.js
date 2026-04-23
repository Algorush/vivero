const { Client } = require('@notionhq/client');

async function run() {
  const notion = new Client({ auth: process.env.NOTION_API_KEY });
  const databaseId = process.env.NOTION_DATA_SOURCE_ID;

  try {
    console.log('--- Database Schema ---');
    const database = await notion.databases.retrieve({ database_id: databaseId });
    for (const [name, property] of Object.entries(database.properties)) {
      console.log(Property: , Type: );
    }

    console.log('\n--- Existing Slugs ---');
    let hasMore = true;
    let startCursor = undefined;
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: databaseId,
        start_cursor: startCursor,
      });
      
      for (const page of response.results) {
        const slugProp = page.properties.slug || page.properties.Slug;
        if (slugProp && slugProp.rich_text) {
          const slugValue = slugProp.rich_text.map(t => t.plain_text).join('');
          if (slugValue) {
            console.log(slugValue);
          }
        }
      }
      
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }
  } catch (error) {
    console.error(error);
  }
}

run();
