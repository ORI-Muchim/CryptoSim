import os

directory_path = './'
file_extensions = ('.js', '.html', '.css', '.py')
exclude_folders = {'node_modules'}

total_lines = 0

for root, dirs, files in os.walk(directory_path, topdown=True):
    dirs[:] = [d for d in dirs if d not in exclude_folders]
    for file in files:
        if file.endswith(file_extensions):
            file_path = os.path.join(root, file)
            try:
                with open(file_path, 'r', encoding="utf-8") as f:
                    file_lines = f.readlines()
                    total_lines += len(file_lines)
                    print(f"Contents of {file_path}:")
                    for line in file_lines:
                        print(line, end='')
                    print("\n" + "-" * 50 + "\n")
            except UnicodeDecodeError as e:
                print(f"Error reading {file_path}: {e}")

print(f"Total lines: {total_lines}")