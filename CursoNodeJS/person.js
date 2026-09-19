class Person {
  constructor(name, age) {
    this.name = name;
  }

  sayMyName() {
    console.log(`Hello, my name is ${this.name}!`);
  }
}

module.exports = {
  Person,
};
