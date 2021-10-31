.PHONY: all
all: index.zip

index.zip: index.js node_modules
	npm install --arch=x64 --platform=linux --only=production
	zip -r index.zip index.js node_modules

.PHONY: clean
clean:
	rm -f index.zip
	rm -rf node_moedules