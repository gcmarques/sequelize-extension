FROM node:9

RUN apt-get install libpq-dev

WORKDIR /sequelize-extension
VOLUME /sequelize-extension

COPY . /sequelize-extension