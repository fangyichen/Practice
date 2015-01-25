Given numRows, generate the first numRows of Pascal's triangle.

For example, given numRows = 5,
Return

[
     [1],
    [1,1],
   [1,2,1],
  [1,3,3,1],
 [1,4,6,4,1]
]

```java
public class Solution {
    public List<List<Integer>> generate(int numRows) {
        List<List<Integer>> result = new ArrayList<List<Integer>>();
        List<Integer> aboveLevel = new ArrayList<Integer>();
        if(numRows == 0) return result;
        if(numRows == 1) {
            aboveLevel.add(1);
            result.add(aboveLevel);
            return result;
        }
        for(int i = 0; i <numRows; i++){
            List<Integer>currLevel = new ArrayList<Integer>();
            currLevel.add(1);
            if(i>1){
                for(int j = 1; j < i; j++ ){
                    currLevel.add(aboveLevel.get(j-1)+aboveLevel.get(j));
                }
            }
            if(i>0) currLevel.add(1);
            result.add(currLevel);
            aboveLevel = currLevel;
        }
        
        return result;
        
    }
}
```