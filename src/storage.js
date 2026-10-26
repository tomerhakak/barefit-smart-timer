export function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem("barefit:" + key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function write(key, value) {
  try {
    localStorage.setItem("barefit:" + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
