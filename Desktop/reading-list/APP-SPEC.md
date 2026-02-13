# Reading List

Track books, articles, and papers. Claude helps you manage your reading queue.

## Data Model

### Item
- id: string (uuid)
- title: string (required)
- author: string (optional)
- type: enum [book, article, paper, other]
- status: enum [want-to-read, reading, finished, abandoned]
- rating: integer 1-5 (optional, set when finished)
- notes: text (optional)
- added_date: datetime
- started_date: datetime (optional)
- finished_date: datetime (optional)
- tags: string[] (optional)

## Features

### MCP Tools
- reading_list("list") — show all items, filterable by status/type/tag
- reading_list("add", title="...", author="...", type="book") — add item
- reading_list("update", id="...", status="reading") — update item
- reading_list("remove", id="...") — remove item
- reading_list("stats") — reading statistics (count by status, avg rating, etc.)

### Dashboard UI
- Grid/list view of reading items
- Filter by status (tabs: All, Reading, Want to Read, Finished)
- Click to expand details
- Add new item modal
- Status indicators (color-coded)

## Example Interactions

Claude: "I just finished reading 'Thinking Fast and Slow'"
> reading_list("update", title="Thinking Fast and Slow", status="finished")

Claude: "Add 'The Design of Everyday Things' to my reading list"
> reading_list("add", title="The Design of Everyday Things", author="Don Norman", type="book")

Claude: "What am I currently reading?"
> reading_list("list", status="reading")
