Reads a file from the local filesystem. You can access any file directly by using this tool. Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:

- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long
files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool detects image, video, and audio files but returns only metadata (file type, path, and size) rather than content to avoid context overflow. Use the multimodal-analyzer tool if you want to analyze the actual content.
- You have the capability to call multiple tools in a single response. It is always
better to speculatively read multiple files as a batch that are potentially useful.
- If you read a file that exists but has empty contents you will receive a system
reminder warning in place of file contents.

Parameters:

- file_path (required): The absolute path to the file to read
- limit (optional): The number of lines to read. Only provide if the file is too
large to read at once.
- offset (optional): The line number to start reading from. Only provide if the file
is too large to read at once
