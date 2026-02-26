const key = 'AIzaSyBesx67Ben3tJZlsoZEv8LF2j0aQiDRwxA';
fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`)
  .then(res => res.json())
  .then(data => {
    const models = data.models.map(m => m.name);
    console.log(models);
  });
