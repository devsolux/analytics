VERSION ?= 1.0.0

clean:
	sudo rm -rf dist/
	sudo rm -rf .next/
	sudo rm -rf prisma/
	sudo rm -rf build/
	sudo rm public/script.js
	sudo rm -rf geo/
	sudo rm -rf out/

install:
	yarn install
	yarn build
