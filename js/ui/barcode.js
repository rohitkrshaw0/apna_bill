export function generateBarcodeCode () {
  const timePart = Date.now().toString().slice(-9);
  let randomPart = '';
  for (let i = 0; i < 3; i++) randomPart += Math.floor(Math.random() * 10).toString();
  return timePart + randomPart;
}
