.PHONY: all
all: clean index.zip

index.zip: index.js node_modules
	zip index.zip index.js node_modules

.PHONY: clean
clean:
	rm index.zip